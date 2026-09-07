import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { r2 } from "./r2";
import { avatarKey, playPhotoKey, tuckboxKey, rulebookKey } from "./lib/r2keys";

/**
 * One-time backfill: copy every existing Convex-stored file into R2 and record
 * its object key on the owning document, so reads move from Convex storage to our
 * R2 CDN. Idempotent + resumable — each pass skips docs that already have a key,
 * and reschedules itself until the table is done. Legacy blobs are left in place
 * (delete them in a later cleanup pass once you've verified). Game covers are
 * handled separately in `images.ts` (they may need a BGG re-fetch + compress).
 *
 * Run per table from the CLI once R2 env vars are set, e.g.:
 *   npx convex run backfillR2:backfillAvatars '{}'
 *   npx convex run backfillR2:backfillPlayPhotos '{}'
 *   npx convex run backfillR2:backfillTuckboxes '{}'
 *   npx convex run backfillR2:backfillRulebooks '{}'
 */

const PAGE = 25;

/** Copy a legacy Convex blob to R2 at `key`. Returns the key, or null if the
 *  blob is missing/unfetchable (caller keeps the legacy id as a fallback). */
async function copyBlob(
  ctx: ActionCtx,
  storageId: Id<"_storage">,
  key: string,
): Promise<string | null> {
  const url = await ctx.storage.getUrl(storageId);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  return await r2.store(ctx, bytes, {
    key,
    type: res.headers.get("content-type") ?? undefined,
    cacheControl: "public, max-age=31536000, immutable",
  });
}

/* -------------------------------------------------------------------------- */
/* Avatars                                                                    */
/* -------------------------------------------------------------------------- */

export const usersPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    return await ctx.db.query("users").paginate(paginationOpts);
  },
});

export const patchUser = internalMutation({
  args: {
    userId: v.id("users"),
    avatarKey: v.optional(v.string()),
    avatarKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { userId, avatarKey, avatarKeys }) => {
    const patch: Record<string, unknown> = {};
    if (avatarKey !== undefined) patch.avatarKey = avatarKey;
    if (avatarKeys !== undefined) patch.avatarKeys = avatarKeys;
    if (Object.keys(patch).length) await ctx.db.patch("users", userId, patch);
  },
});

export const backfillAvatars = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }): Promise<void> => {
    const { page, continueCursor, isDone } = await ctx.runQuery(
      internal.backfillR2.usersPage,
      { paginationOpts: { numItems: PAGE, cursor: cursor ?? null } },
    );
    for (const u of page) {
      const slug = u.username ?? u._id;
      const idToKey = new Map<Id<"_storage">, string>();
      // Migrate the recents history (dedupes the current avatar if it's in it).
      if ((u.avatarHistory?.length ?? 0) > 0 && !(u.avatarKeys?.length ?? 0)) {
        for (const sid of u.avatarHistory ?? []) {
          const key = await copyBlob(ctx, sid, avatarKey(slug, crypto.randomUUID()));
          if (key) idToKey.set(sid, key);
        }
      }
      let avatarKeyVal: string | undefined;
      if (u.avatarStorageId && !u.avatarKey) {
        avatarKeyVal =
          idToKey.get(u.avatarStorageId) ??
          (await copyBlob(
            ctx,
            u.avatarStorageId,
            avatarKey(slug, crypto.randomUUID()),
          )) ??
          undefined;
      }
      const avatarKeysVal = idToKey.size ? [...idToKey.values()] : undefined;
      if (avatarKeyVal !== undefined || avatarKeysVal !== undefined) {
        await ctx.runMutation(internal.backfillR2.patchUser, {
          userId: u._id,
          avatarKey: avatarKeyVal,
          avatarKeys: avatarKeysVal,
        });
      }
    }
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.backfillR2.backfillAvatars, {
        cursor: continueCursor,
      });
    }
  },
});

/* -------------------------------------------------------------------------- */
/* Play photos                                                                */
/* -------------------------------------------------------------------------- */

export const playsPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    return await ctx.db.query("plays").paginate(paginationOpts);
  },
});

export const setPlayPhotoKeys = internalMutation({
  args: { playId: v.id("plays"), photoKeys: v.array(v.string()) },
  handler: async (ctx, { playId, photoKeys }) => {
    await ctx.db.patch("plays", playId, { photoKeys });
  },
});

export const backfillPlayPhotos = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }): Promise<void> => {
    const { page, continueCursor, isDone } = await ctx.runQuery(
      internal.backfillR2.playsPage,
      { paginationOpts: { numItems: PAGE, cursor: cursor ?? null } },
    );
    for (const p of page) {
      if (!(p.photoIds?.length ?? 0) || p.photoKeys?.length) continue;
      const game = p.gameId ? await ctx.runQuery(internal.games.slugOf, { gameId: p.gameId }) : null;
      const folder = game ?? p.title ?? "misc";
      const keys: string[] = [];
      for (const sid of p.photoIds ?? []) {
        const key = await copyBlob(ctx, sid, playPhotoKey(folder, crypto.randomUUID()));
        if (key) keys.push(key);
      }
      if (keys.length) {
        await ctx.runMutation(internal.backfillR2.setPlayPhotoKeys, {
          playId: p._id,
          photoKeys: keys,
        });
      }
    }
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.backfillR2.backfillPlayPhotos, {
        cursor: continueCursor,
      });
    }
  },
});

/* -------------------------------------------------------------------------- */
/* Tuckboxes                                                                  */
/* -------------------------------------------------------------------------- */

export const tuckboxesPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    return await ctx.db.query("tuckboxes").paginate(paginationOpts);
  },
});

export const patchTuckbox = internalMutation({
  args: {
    id: v.id("tuckboxes"),
    faceKeys: v.array(v.object({ index: v.number(), key: v.string() })),
    wrapKey: v.optional(v.string()),
    coverKey: v.optional(v.string()),
  },
  handler: async (ctx, { id, faceKeys, wrapKey, coverKey }) => {
    const box = await ctx.db.get("tuckboxes", id);
    if (!box) return;
    const faces = box.faces.map((f, i) => {
      const hit = faceKeys.find((k) => k.index === i);
      return hit ? { ...f, key: hit.key } : f;
    });
    const wrap = box.wrap && wrapKey ? { ...box.wrap, key: wrapKey } : box.wrap;
    await ctx.db.patch("tuckboxes", id, {
      faces,
      wrap,
      coverKey: coverKey ?? box.coverKey,
    });
  },
});

export const backfillTuckboxes = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }): Promise<void> => {
    const { page, continueCursor, isDone } = await ctx.runQuery(
      internal.backfillR2.tuckboxesPage,
      { paginationOpts: { numItems: PAGE, cursor: cursor ?? null } },
    );
    for (const box of page) {
      const folder = box.name || "box";
      const faceKeys: { index: number; key: string }[] = [];
      for (let i = 0; i < box.faces.length; i++) {
        const f = box.faces[i];
        if (f.key || !f.storageId) continue;
        const key = await copyBlob(ctx, f.storageId, tuckboxKey(folder, crypto.randomUUID()));
        if (key) faceKeys.push({ index: i, key });
      }
      let wrapKey: string | undefined;
      if (box.wrap && !box.wrap.key && box.wrap.storageId) {
        wrapKey =
          (await copyBlob(ctx, box.wrap.storageId, tuckboxKey(folder, crypto.randomUUID()))) ??
          undefined;
      }
      let coverKey: string | undefined;
      if (!box.coverKey && box.coverStorageId) {
        // The cover mirrors a face/wrap — reuse the key we just made for it.
        coverKey = wrapKey ?? faceKeys[0]?.key;
      }
      if (faceKeys.length || wrapKey || coverKey) {
        await ctx.runMutation(internal.backfillR2.patchTuckbox, {
          id: box._id,
          faceKeys,
          wrapKey,
          coverKey,
        });
      }
    }
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.backfillR2.backfillTuckboxes, {
        cursor: continueCursor,
      });
    }
  },
});

/* -------------------------------------------------------------------------- */
/* Rulebook / download files                                                  */
/* -------------------------------------------------------------------------- */

export const rulebooksPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    return await ctx.db.query("rulebooks").paginate(paginationOpts);
  },
});

export const setRulebookKey = internalMutation({
  args: { rulebookId: v.id("rulebooks"), storageKey: v.string() },
  handler: async (ctx, { rulebookId, storageKey }) => {
    await ctx.db.patch("rulebooks", rulebookId, { storageKey });
  },
});

export const backfillRulebooks = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }): Promise<void> => {
    const { page, continueCursor, isDone } = await ctx.runQuery(
      internal.backfillR2.rulebooksPage,
      { paginationOpts: { numItems: PAGE, cursor: cursor ?? null } },
    );
    for (const rb of page) {
      if (rb.storageKey || !rb.storageId) continue;
      const slug = await ctx.runQuery(internal.games.slugOf, { gameId: rb.gameId });
      const safeName = rb.filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
      const key = await copyBlob(
        ctx,
        rb.storageId,
        rulebookKey(slug ?? "game", safeName),
      );
      if (key) {
        await ctx.runMutation(internal.backfillR2.setRulebookKey, {
          rulebookId: rb._id,
          storageKey: key,
        });
      }
    }
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.backfillR2.backfillRulebooks, {
        cursor: continueCursor,
      });
    }
  },
});
