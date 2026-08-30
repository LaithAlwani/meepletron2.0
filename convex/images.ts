"use node";

import { v, ConvexError } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon/node";
import {
  parseItem,
  parseFullItem,
  parseItemType,
  parseExpansionParents,
} from "./lib/bggThing";

const MAX_WIDTH = 800;
const THUMB_WIDTH = 256;
const JPEG_QUALITY = 82;
const MAX_FETCH_BYTES = 15 * 1024 * 1024;

/**
 * Downscale (if wider than maxWidth) and re-encode as JPEG via WASM Photon.
 * Returns `null` if the image can't be decoded so callers can fall back.
 */
function encodeJpeg(original: Uint8Array, maxWidth: number): Uint8Array | null {
  try {
    const img = PhotonImage.new_from_byteslice(original);
    const w = img.get_width();
    const h = img.get_height();
    let source = img;
    let resized: PhotonImage | null = null;
    if (w > maxWidth) {
      const targetH = Math.max(1, Math.round(h * (maxWidth / w)));
      resized = resize(img, maxWidth, targetH, SamplingFilter.Lanczos3);
      source = resized;
    }
    const jpeg = source.get_bytes_jpeg(JPEG_QUALITY);
    img.free();
    if (resized) resized.free();
    return jpeg;
  } catch {
    return null;
  }
}

/**
 * Admin: set a game's cover from an image URL. Fetches the image server-side
 * (no CORS), compresses it (downscale to <=800px + JPEG q82 via WASM Photon),
 * keeps whichever is smaller, and stores only that in Convex storage.
 */
export const setGameCoverFromUrl = action({
  args: { gameId: v.id("games"), url: v.string() },
  handler: async (ctx, { gameId, url }) => {
    await ctx.runQuery(internal.users.ensureAdmin, {});

    if (!/^https?:\/\//i.test(url.trim())) {
      throw new ConvexError("Enter a valid http(s) image URL");
    }

    const res = await fetch(url.trim());
    if (!res.ok) throw new ConvexError("Couldn't fetch that URL");
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      throw new ConvexError("That URL doesn't point to an image");
    }
    const original = new Uint8Array(await res.arrayBuffer());
    if (original.byteLength === 0) throw new ConvexError("The image was empty");
    if (original.byteLength > MAX_FETCH_BYTES) {
      throw new ConvexError("That image is too large (max 15 MB)");
    }

    // Cover: compress (best-effort — store original if it can't be decoded or
    // compression didn't actually shrink it).
    const coverJpeg = encodeJpeg(original, MAX_WIDTH);
    let outBytes: Uint8Array = original;
    let outType = contentType;
    if (coverJpeg && coverJpeg.byteLength < original.byteLength) {
      outBytes = coverJpeg;
      outType = "image/jpeg";
    }
    const storageId = await ctx.storage.store(
      new Blob([Buffer.from(outBytes)], { type: outType }),
    );

    // Thumbnail: a small dedicated crop for grids/lists. Only store a separate
    // blob when we could actually decode + shrink it; otherwise the cover is
    // reused (setGameImage aliases thumbnail → cover when none is given).
    let thumbnailId: Id<"_storage"> | undefined;
    const thumbJpeg = encodeJpeg(original, THUMB_WIDTH);
    if (thumbJpeg && thumbJpeg.byteLength < outBytes.byteLength) {
      thumbnailId = await ctx.storage.store(
        new Blob([Buffer.from(thumbJpeg)], { type: "image/jpeg" }),
      );
    }

    // Reuse the admin-gated mutation (auth propagates from this action).
    await ctx.runMutation(api.games.setGameImage, {
      gameId,
      storageId,
      thumbnailId,
    });
  },
});

/**
 * Fetch + compress + store a cover from a URL, best-effort. Returns the storage
 * ids (or undefined when the image can't be fetched/decoded) without touching
 * any game — the enrichment mutation attaches them. Never throws.
 */
async function fetchAndStoreCover(
  ctx: { storage: { store: (b: Blob) => Promise<Id<"_storage">> } },
  url: string,
): Promise<{ imageId?: Id<"_storage">; thumbnailId?: Id<"_storage"> }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return {};
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return {};
    const original = new Uint8Array(await res.arrayBuffer());
    if (original.byteLength === 0 || original.byteLength > MAX_FETCH_BYTES) {
      return {};
    }
    const coverJpeg = encodeJpeg(original, MAX_WIDTH);
    let outBytes: Uint8Array = original;
    let outType = contentType;
    if (coverJpeg && coverJpeg.byteLength < original.byteLength) {
      outBytes = coverJpeg;
      outType = "image/jpeg";
    }
    const imageId = await ctx.storage.store(
      new Blob([Buffer.from(outBytes)], { type: outType }),
    );
    let thumbnailId: Id<"_storage"> | undefined;
    const thumbJpeg = encodeJpeg(original, THUMB_WIDTH);
    if (thumbJpeg && thumbJpeg.byteLength < outBytes.byteLength) {
      thumbnailId = await ctx.storage.store(
        new Blob([Buffer.from(thumbJpeg)], { type: "image/jpeg" }),
      );
    }
    return { imageId, thumbnailId };
  } catch {
    return {};
  }
}

/**
 * Background enrichment for one stub game created by BGG collection sync: fetch
 * its full `/thing` metadata + stats, store a compressed cover, and hand it to
 * `applyStubEnrichment` which promotes the stub to a real catalogue entry.
 *
 * Best-effort throughout — any failure stamps `bggCheckedAt` (via markChecked)
 * so the sweep in `bggSync.enrichStubs` backs the game off instead of looping.
 */
/**
 * Fetch one game's full `/thing` metadata + stats, store a compressed cover, and
 * promote the stub to a real catalogue entry via `applyStubEnrichment`. Shared by
 * the collection-sync sweep and the on-demand import. Best-effort — a failed
 * fetch stamps `bggCheckedAt` (markChecked) so callers back off / fall back.
 */
async function enrichGameFromBgg(
  ctx: ActionCtx,
  gameId: Id<"games">,
  bggId: string,
): Promise<void> {
  const token = process.env.BGG_API_TOKEN;
  if (!token) return;

  let block: string | undefined;
  try {
    const res = await fetch(
      `https://boardgamegeek.com/xmlapi2/thing?id=${bggId}&stats=1`,
      {
        headers: {
          "User-Agent": "Meepletron/1.0 (board game rules assistant)",
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (res.ok) block = (await res.text()).match(/<item [\s\S]*?<\/item>/)?.[0];
  } catch {
    // fall through to markChecked
  }
  if (!block) {
    await ctx.runMutation(internal.bgg.markChecked, { gameId });
    return;
  }

  // Pull the BGG image URLs out of `meta` — they're stored on the game as
  // `bggImageUrl`/`bggThumbUrl` (served directly from BGG's CDN) and also used
  // to fetch the fallback blob below.
  const { imageUrl, thumbnailUrl, ...meta } = parseFullItem(block);
  const bgg = { ...parseItem(block), fetchedAt: Date.now() };
  const isExpansion = parseItemType(block) === "boardgameexpansion";

  // If this is an expansion, make sure its base game exists and link to it.
  // The base may not be in the user's collection, so create + enrich it.
  let parentId: Id<"games"> | undefined;
  if (isExpansion) {
    const parents = parseExpansionParents(block);
    if (parents.length > 0) {
      const base = parents[0];
      const { gameId: pid, needsEnrich } = await ctx.runMutation(
        internal.games.ensureStubForBgg,
        { bggId: base.bggId, title: base.name },
      );
      parentId = pid;
      // Fill the base too when it's new or still an unfilled stub.
      if (needsEnrich) {
        await ctx.scheduler.runAfter(0, internal.images.enrichSyncedGame, {
          gameId: pid,
          bggId: base.bggId,
        });
      }
    }
  }

  const cover = imageUrl ? await fetchAndStoreCover(ctx, imageUrl) : {};

  await ctx.runMutation(internal.games.applyStubEnrichment, {
    gameId,
    meta,
    bgg,
    imageId: cover.imageId,
    thumbnailId: cover.thumbnailId,
    bggImageUrl: imageUrl,
    bggThumbUrl: thumbnailUrl,
    isExpansion,
    parentId,
  });
}

/** Background enrichment for one stub game created by BGG collection sync. */
export const enrichSyncedGame = internalAction({
  args: { gameId: v.id("games"), bggId: v.string() },
  handler: async (ctx, { gameId, bggId }) => {
    await enrichGameFromBgg(ctx, gameId, bggId);
  },
});

/**
 * On-demand import of a game the catalogue doesn't have yet, from a BGG id.
 * Creates the game if needed, fetches its full details + cover, and returns the
 * slug to route to. Deduped: an already-imported game returns immediately. Open
 * to everyone (guests included) — the data is canonical BGG data keyed by id.
 */
export const importGame = action({
  args: { bggId: v.string(), title: v.optional(v.string()) },
  handler: async (
    ctx,
    { bggId, title },
  ): Promise<{ slug: string; gameId: Id<"games">; created: boolean }> => {
    const id = bggId.trim();
    if (!/^\d+$/.test(id)) {
      throw new ConvexError("That doesn't look like a valid game.");
    }

    const existing = await ctx.runQuery(internal.games.gameByBggId, {
      bggId: id,
    });
    if (existing && !existing.isStub) {
      return { slug: existing.slug, gameId: existing._id, created: false };
    }

    let gameId: Id<"games">;
    let created = false;
    if (existing) {
      gameId = existing._id;
    } else {
      const stub = await ctx.runMutation(internal.games.ensureStubForBgg, {
        bggId: id,
        title: (title ?? "").trim() || "New game",
      });
      gameId = stub.gameId;
      created = true;
    }

    // Await full enrichment so the detail page we route to already has everything.
    await enrichGameFromBgg(ctx, gameId, id);

    const after = await ctx.runQuery(internal.games.gameByBggId, { bggId: id });
    if (!after) {
      throw new ConvexError("Couldn't set up that game. Please try again.");
    }
    return { slug: after.slug, gameId: after._id, created };
  },
});
