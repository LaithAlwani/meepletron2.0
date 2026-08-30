import { v, ConvexError } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { bggStatsValidator } from "./lib/bggStats";
import { bggSortKeys } from "./lib/gameSort";
import { parseItem, parseFullItem, decodeEntities } from "./lib/bggThing";

const BGG_USER_AGENT = "Meepletron/1.0 (board game rules assistant)";

export type BggPreview = {
  bggId: string;
  name: string;
  year: string | null;
  thumbUrl: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  minPlayTime: number | null;
  maxPlayTime: number | null;
  rating: number | null;
};

/**
 * Search BoardGameGeek by name for the "not in our library yet" results, then
 * enrich the hits with a cover thumbnail + basic details via a single batched
 * `/thing` call. Public; returns [] on any failure so search degrades gracefully
 * to the local catalogue. The full metadata + stored cover happen on import.
 */
export const search = action({
  args: { term: v.string() },
  handler: async (ctx, { term }): Promise<BggPreview[]> => {
    const q = term.trim();
    if (q.length < 2) return [];
    const token = process.env.BGG_API_TOKEN;
    if (!token) return [];
    const headers = {
      "User-Agent": BGG_USER_AGENT,
      Authorization: `Bearer ${token}`,
    };
    try {
      // 1) Name search → ids + names.
      const res = await fetch(
        `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(
          q,
        )}&type=boardgame,boardgameexpansion`,
        { headers },
      );
      if (!res.ok) return [];
      const xml = await res.text();
      const seen = new Set<string>();
      const found: { bggId: string; name: string; year: string | null }[] = [];
      for (const m of xml.matchAll(/<item\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/item>/g)) {
        const bggId = m[1];
        if (seen.has(bggId)) continue;
        const inner = m[2];
        const name = inner.match(/<name\b[^>]*\bvalue="([^"]*)"/)?.[1];
        if (!name) continue;
        const yearRaw = inner.match(/<yearpublished\b[^>]*\bvalue="([^"]*)"/)?.[1];
        seen.add(bggId);
        found.push({
          bggId,
          name: decodeEntities(name),
          year: yearRaw && yearRaw !== "0" ? yearRaw : null,
        });
        if (found.length >= 12) break;
      }
      if (found.length === 0) return [];

      // 2) One batched /thing call for covers + basic details.
      const details = new Map<
        string,
        Omit<BggPreview, "bggId" | "name" | "year">
      >();
      try {
        const ids = found.map((f) => f.bggId).join(",");
        const thing = await fetch(
          `https://boardgamegeek.com/xmlapi2/thing?id=${ids}&stats=1`,
          { headers },
        );
        if (thing.ok) {
          const thingXml = await thing.text();
          for (const m of thingXml.matchAll(/<item [\s\S]*?<\/item>/g)) {
            const block = m[0];
            const id = block.match(/<item[^>]*\bid="(\d+)"/)?.[1];
            if (!id) continue;
            const full = parseFullItem(block);
            const stats = parseItem(block);
            const thumb = block.match(/<thumbnail>([^<]+)<\/thumbnail>/)?.[1];
            details.set(id, {
              thumbUrl: thumb
                ? decodeEntities(thumb).trim()
                : (full.imageUrl ?? null),
              minPlayers: full.minPlayers ?? null,
              maxPlayers: full.maxPlayers ?? null,
              minPlayTime: full.minPlayTime ?? null,
              maxPlayTime: full.maxPlayTime ?? null,
              rating: stats.rating ?? null,
            });
          }
        }
      } catch {
        // details are best-effort — fall back to name/year only
      }

      return found.map((f) => ({
        ...f,
        thumbUrl: details.get(f.bggId)?.thumbUrl ?? null,
        minPlayers: details.get(f.bggId)?.minPlayers ?? null,
        maxPlayers: details.get(f.bggId)?.maxPlayers ?? null,
        minPlayTime: details.get(f.bggId)?.minPlayTime ?? null,
        maxPlayTime: details.get(f.bggId)?.maxPlayTime ?? null,
        rating: details.get(f.bggId)?.rating ?? null,
      }));
    } catch {
      return [];
    }
  },
});

export const setBggStats = internalMutation({
  args: { gameId: v.id("games"), bgg: bggStatsValidator },
  handler: async (ctx, { gameId, bgg }) => {
    // Keep the denormalized sort keys in step with the refreshed stats (title /
    // year are untouched by a stats refresh, so their keys stay valid).
    await ctx.db.patch("games", gameId, {
      bgg,
      bggCheckedAt: Date.now(),
      ...bggSortKeys(bgg),
    });
  },
});

/**
 * Record that we tried and got nothing usable. Without this a game whose fetch
 * always fails would stay "never refreshed" forever and take a slot in every
 * single cron run.
 */
export const markChecked = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    await ctx.db.patch("games", gameId, { bggCheckedAt: Date.now() });
  },
});

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // ratings barely move — weekly is plenty

export const refreshTarget = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const g = await ctx.db.get("games", gameId);
    if (!g) return null;
    return { bggId: g.bggId ?? null, fetchedAt: g.bgg?.fetchedAt ?? null };
  },
});

/**
 * TTL-gated refresh of one game's BGG stats.
 *
 * Internal on purpose. This used to be a public action called from the game
 * detail page, which meant anyone could drive unlimited Convex invocations and
 * BGG fetches through it with an arbitrary gameId. It's now reachable only via
 * the hourly `refreshStale` cron below.
 *
 * A failed fetch leaves the cached stats untouched — the DB is always the read
 * source — but still stamps `bggCheckedAt` so the game backs off.
 */
export const refreshOne = internalAction({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<void> => {
    const token = process.env.BGG_API_TOKEN;
    if (!token) return;
    const target = await ctx.runQuery(internal.bgg.refreshTarget, { gameId });
    if (!target || !target.bggId) return;
    if (target.fetchedAt && Date.now() - target.fetchedAt < REFRESH_TTL_MS) {
      return;
    }
    try {
      const res = await fetch(
        `https://boardgamegeek.com/xmlapi2/thing?id=${target.bggId}&stats=1`,
        {
          headers: {
            "User-Agent": "Meepletron/1.0 (board game rules assistant)",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const xml = res.ok ? await res.text() : "";
      const block = xml.match(/<item [\s\S]*?<\/item>/)?.[0];
      if (!block) {
        await ctx.runMutation(internal.bgg.markChecked, { gameId });
        return;
      }
      await ctx.runMutation(internal.bgg.setBggStats, {
        gameId,
        bgg: { ...parseItem(block), fetchedAt: Date.now() },
      });
    } catch {
      // Leave the cached stats as-is, but don't retry this game every hour.
      await ctx.runMutation(internal.bgg.markChecked, { gameId });
    }
  },
});

/** How many games one cron run refreshes. The ceiling on BGG traffic per hour. */
const REFRESH_BATCH = 20;
/** Gap between fetches within a run, so a batch isn't a burst. */
const REFRESH_STAGGER_MS = 3000;

/**
 * Games most overdue for a stats refresh, oldest-checked first.
 *
 * Reads curated games through the `by_isStub_and_isExpansion` index using an
 * `isStub` prefix. Excluding stubs is load-bearing: collection sync auto-creates
 * stub games *with a bggId set*, so without the filter thousands of them would
 * flood the queue and starve the real catalogue.
 *
 * This scans the curated games (~a few hundred). If that grows past a few
 * thousand it wants its own index rather than a scan.
 */
export const dueForRefresh = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const cutoff = Date.now() - REFRESH_TTL_MS;
    // Range scan on the refresh index: only non-stub games whose last check is
    // older than the TTL (never-checked games have `bggCheckedAt: undefined`,
    // which sorts first, so they're picked up too), stalest-first. We read a
    // small multiple of the batch to skip any curated games without a bggId,
    // instead of scanning the whole catalogue.
    const due = await ctx.db
      .query("games")
      .withIndex("by_isStub_and_bggCheckedAt", (q) =>
        q.eq("isStub", false).lt("bggCheckedAt", cutoff),
      )
      .take(limit * 5);

    return due
      .filter((g) => !!g.bggId)
      .slice(0, limit)
      .map((g) => g._id);
  },
});

/**
 * Cron entry point: refresh the stalest games. Replaces the old
 * viewed-page-triggers-a-refresh path, so games nobody opens stay fresh too.
 */
export const refreshStale = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    if (!process.env.BGG_API_TOKEN) return;
    const gameIds = await ctx.runQuery(internal.bgg.dueForRefresh, {
      limit: REFRESH_BATCH,
    });
    for (const [i, gameId] of gameIds.entries()) {
      await ctx.scheduler.runAfter(
        i * REFRESH_STAGGER_MS,
        internal.bgg.refreshOne,
        { gameId },
      );
    }
  },
});

/* -------------------------------------------------------------------------- */
/* One-time backfill: populate bggImageUrl / bggThumbUrl on existing games so   */
/* covers serve from BGG's CDN instead of Convex storage. Run once with         */
/* `npx convex run bgg:backfillCovers` (add --prod for production).             */
/* -------------------------------------------------------------------------- */

const BACKFILL_BATCH = 30;
const BACKFILL_STAGGER_MS = 1200; // ~0.8 req/s to BGG — gentle, one-time.

/** Patch a game's BGG cover URLs (only the provided ones). */
export const setBggCovers = internalMutation({
  args: {
    gameId: v.id("games"),
    bggImageUrl: v.optional(v.string()),
    bggThumbUrl: v.optional(v.string()),
  },
  handler: async (ctx, { gameId, bggImageUrl, bggThumbUrl }) => {
    const patch: Record<string, string> = {};
    if (bggImageUrl) patch.bggImageUrl = bggImageUrl;
    if (bggThumbUrl) patch.bggThumbUrl = bggThumbUrl;
    if (Object.keys(patch).length > 0) await ctx.db.patch("games", gameId, patch);
  },
});

/** A synced collection row's BGG image URLs for a bggId (no HTTP needed). */
export const collectionCoverForBgg = internalQuery({
  args: { bggId: v.string() },
  handler: async (ctx, { bggId }) => {
    const row = await ctx.db
      .query("bggCollection")
      .withIndex("by_bgg_id", (q) => q.eq("bggId", bggId))
      .first();
    if (!row) return null;
    return {
      imageUrl: row.imageUrl ?? null,
      thumbnailUrl: row.thumbnailUrl ?? null,
    };
  },
});

/** One page of non-stub games (paginated) with a flag for missing BGG covers. */
export const gamesPageForCovers = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), limit: v.number() },
  handler: async (ctx, { cursor, limit }) => {
    const res = await ctx.db
      .query("games")
      .withIndex("by_isStub_and_isExpansion", (q) => q.eq("isStub", false))
      .paginate({ numItems: limit, cursor });
    return {
      page: res.page.map((g) => ({
        _id: g._id,
        bggId: g.bggId ?? null,
        missing: !g.bggThumbUrl,
      })),
      isDone: res.isDone,
      continueCursor: res.continueCursor,
    };
  },
});

/** Fill one game's cover URLs — from a collection row if possible, else BGG. */
export const fetchCoverOne = internalAction({
  args: { gameId: v.id("games"), bggId: v.string() },
  handler: async (ctx, { gameId, bggId }): Promise<void> => {
    // Cheap path: copy from a synced collection row (no HTTP).
    const fromCollection = await ctx.runQuery(internal.bgg.collectionCoverForBgg, {
      bggId,
    });
    if (fromCollection?.thumbnailUrl || fromCollection?.imageUrl) {
      await ctx.runMutation(internal.bgg.setBggCovers, {
        gameId,
        bggImageUrl:
          fromCollection.imageUrl ?? fromCollection.thumbnailUrl ?? undefined,
        bggThumbUrl:
          fromCollection.thumbnailUrl ?? fromCollection.imageUrl ?? undefined,
      });
      return;
    }
    // Otherwise fetch the /thing XML and parse the image + thumbnail URLs.
    const token = process.env.BGG_API_TOKEN;
    if (!token) return;
    try {
      const res = await fetch(
        `https://boardgamegeek.com/xmlapi2/thing?id=${bggId}`,
        {
          headers: {
            "User-Agent": BGG_USER_AGENT,
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const xml = res.ok ? await res.text() : "";
      const block = xml.match(/<item [\s\S]*?<\/item>/)?.[0];
      if (!block) return;
      const { imageUrl, thumbnailUrl } = parseFullItem(block);
      if (imageUrl || thumbnailUrl) {
        await ctx.runMutation(internal.bgg.setBggCovers, {
          gameId,
          bggImageUrl: imageUrl,
          bggThumbUrl: thumbnailUrl,
        });
      }
    } catch {
      // Skip; a re-run can retry this game.
    }
  },
});

/**
 * Entry point for the one-time cover backfill. Paginates non-stub games,
 * schedules a staggered `fetchCoverOne` for each that's missing a BGG cover,
 * then reschedules itself for the next page until done.
 */
export const backfillCovers = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }): Promise<void> => {
    const { page, isDone, continueCursor } = await ctx.runQuery(
      internal.bgg.gamesPageForCovers,
      { cursor: cursor ?? null, limit: BACKFILL_BATCH },
    );
    let scheduled = 0;
    for (const g of page) {
      if (g.bggId && g.missing) {
        await ctx.scheduler.runAfter(
          scheduled * BACKFILL_STAGGER_MS,
          internal.bgg.fetchCoverOne,
          { gameId: g._id, bggId: g.bggId },
        );
        scheduled++;
      }
    }
    if (!isDone) {
      await ctx.scheduler.runAfter(
        scheduled * BACKFILL_STAGGER_MS + 3000,
        internal.bgg.backfillCovers,
        { cursor: continueCursor },
      );
    }
  },
});

/**
 * Admin: fetch a game's metadata + stats from BGG by id, to prefill the game
 * form. Returns the parsed fields (does not save) plus the stats object.
 */
export const fetchGameInfo = action({
  args: { bggId: v.string() },
  handler: async (ctx, { bggId }) => {
    await ctx.runQuery(internal.users.ensureAdmin, {});
    const id = bggId.trim();
    if (!/^\d+$/.test(id)) throw new ConvexError("Enter a numeric BGG id.");
    const token = process.env.BGG_API_TOKEN;
    if (!token) {
      throw new ConvexError(
        "BGG_API_TOKEN is not set. Set it with: npx convex env set BGG_API_TOKEN <token> --prod",
      );
    }
    const res = await fetch(
      `https://boardgamegeek.com/xmlapi2/thing?id=${id}&stats=1`,
      {
        headers: {
          "User-Agent": "Meepletron/1.0 (board game rules assistant)",
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!res.ok) throw new ConvexError(`BGG request failed (${res.status}).`);
    const xml = await res.text();
    const itemMatch = xml.match(/<item [\s\S]*?<\/item>/);
    if (!itemMatch) throw new ConvexError("No game found for that BGG id.");
    const block = itemMatch[0];
    return {
      ...parseFullItem(block),
      bggId: id,
      bgg: { ...parseItem(block), fetchedAt: Date.now() },
    };
  },
});
