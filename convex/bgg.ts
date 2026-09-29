import { v, ConvexError } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { bggStatsValidator } from "./lib/bggStats";
import { bggSortKeys } from "./lib/gameSort";
import {
  parseItem,
  parseFullItem,
  parseExpansionLinks,
  decodeEntities,
} from "./lib/bggThing";

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

/**
 * How many games one cron run refreshes. BGG's /thing takes comma-separated
 * ids, so this is fetched as ceil(REFRESH_BATCH / THING_CHUNK) requests rather
 * than one per game — which is what lets the number be this size.
 *
 * Sized against the TTL: ~2,000 curated games refreshed weekly needs ~290 a
 * day, so 300 daily keeps every game inside its 7-day window. That's 15
 * requests per run, about 45 seconds of staggered traffic. The old 20-per-run
 * (every 72h) covered ~7 games a day and could never catch up.
 */
const REFRESH_BATCH = 300;
/** Ids per /thing call. BGG accepts a comma-separated list; keep it modest. */
const THING_CHUNK = 20;
/** Gap between requests within a run, so a batch isn't a burst. */
const REFRESH_STAGGER_MS = 3000;

/**
 * Expansions below this many BGG ratings aren't recorded.
 *
 * BGG's expansion list is exhaustive, not curated: a popular game lists every
 * promo card and fan item next to its real expansions. Recording all of them
 * would bury the handful people play — and because `bggSync.enrichStubs`
 * self-drains, every one created would also pull its own BGG fetch. The rating
 * count is the cheapest signal that separates the two, and it arrives in the
 * same batched call that qualifies them.
 */
const MIN_EXPANSION_RATINGS = 30;
/** Ceiling on how many links we'll qualify for one game (Carcassonne has 200+). */
const MAX_EXPANSION_LINKS = 100;

/** Stable fingerprint of a BGG expansion-id set, order-independent. */
function expansionsFingerprint(ids: string[]): string {
  return [...ids].sort().join(",");
}

/** Split a list into fixed-size chunks. */
function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** Every `<item>` block in a /thing response, keyed by BGG id. */
function itemsById(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of xml.matchAll(/<item\b[^>]*\bid="(\d+)"[\s\S]*?<\/item>/g)) {
    out.set(m[1], m[0]);
  }
  return out;
}

/** One authenticated /thing call for up to THING_CHUNK ids. */
async function fetchThing(ids: string[], stats: boolean): Promise<string> {
  const token = process.env.BGG_API_TOKEN;
  if (!token) return "";
  const res = await fetch(
    `https://boardgamegeek.com/xmlapi2/thing?id=${ids.join(",")}${
      stats ? "&stats=1" : ""
    }`,
    {
      headers: {
        "User-Agent": BGG_USER_AGENT,
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return res.ok ? await res.text() : "";
}

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
    // which sorts first, so they're picked up too), stalest-first.
    //
    // The headroom over `limit` is there to skip curated games with no bggId.
    // It's deliberately small: these are full game documents (descriptions and
    // all), so at the current batch size a 5x multiple would read ~1,500 docs —
    // megabytes per run, against a transaction that has a size ceiling. Falling
    // slightly short just leaves the rest for tomorrow's run.
    const due = await ctx.db
      .query("games")
      .withIndex("by_isStub_and_bggCheckedAt", (q) =>
        q.eq("isStub", false).lt("bggCheckedAt", cutoff),
      )
      .take(Math.min(limit * 2, 800));

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
    // One request per chunk rather than per game: 100 games is 5 calls.
    for (const [i, group] of chunk(gameIds, THING_CHUNK).entries()) {
      await ctx.scheduler.runAfter(
        i * REFRESH_STAGGER_MS,
        internal.bgg.refreshChunk,
        { gameIds: group },
      );
    }
  },
});

/**
 * Refresh one chunk of games' BGG stats from a single batched /thing call.
 *
 * A game missing from the response still gets stamped via `markChecked`, so a
 * permanently unresolvable id can't occupy a slot in every run.
 *
 * Expansion reconciliation used to be queued from here, which grew the
 * catalogue on its own. It's now admin-only — an admin adds a game's
 * expansions deliberately via the "Fill from BGG" picker (`recordExpansions`),
 * so nothing creates expansion games in the background anymore.
 */
export const refreshChunk = internalAction({
  args: { gameIds: v.array(v.id("games")) },
  handler: async (ctx, { gameIds }): Promise<void> => {
    const targets = await ctx.runQuery(internal.games.bggIdsFor, { gameIds });
    if (targets.length === 0) return;

    let items: Map<string, string>;
    try {
      items = itemsById(await fetchThing(targets.map((t) => t.bggId), true));
    } catch {
      for (const t of targets) {
        await ctx.runMutation(internal.bgg.markChecked, { gameId: t.gameId });
      }
      return;
    }

    for (const t of targets) {
      const block = items.get(t.bggId);
      if (!block) {
        await ctx.runMutation(internal.bgg.markChecked, { gameId: t.gameId });
        continue;
      }
      await ctx.runMutation(internal.bgg.setBggStats, {
        gameId: t.gameId,
        bgg: { ...parseItem(block), fetchedAt: Date.now() },
      });
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
/**
 * Record a game's BGG expansions now, instead of waiting for the nightly
 * refresh to reach it (admin).
 *
 * Runs the same qualification the cron does — batched /thing calls, keeping
 * links that clear MIN_EXPANSION_RATINGS plus anything already in the library —
 * so an admin pressing the button gets exactly what the cron would have
 * recorded, just sooner.
 */
export const recordExpansions = action({
  args: {
    gameId: v.id("games"),
    /** Exactly what to record — the admin's ticked boxes, not a guess. */
    expansions: v.array(v.object({ bggId: v.string(), title: v.string() })),
    /**
     * Fingerprint of the *full* BGG list the picker was built from, so the
     * nightly pass treats this list as dealt with and doesn't re-add the ones
     * that were deliberately left unticked.
     */
    hash: v.string(),
  },
  handler: async (
    ctx,
    { gameId, expansions, hash },
  ): Promise<{ created: number; linked: number }> => {
    await ctx.runQuery(internal.users.ensureAdmin, {});
    const targets: {
      gameId: Id<"games">;
      bggId: string;
      isExpansion: boolean;
      expansionsHash: string | null;
    }[] = await ctx.runQuery(internal.games.bggIdsFor, { gameIds: [gameId] });
    const target = targets[0];
    if (!target) throw new ConvexError("That game has no BGG id.");
    if (target.isExpansion) {
      throw new ConvexError("Expansions don't have expansions of their own.");
    }

    // No ratings bar here: the admin's selection *is* the filter.
    return await ctx.runMutation(internal.games.linkExpansions, {
      parentId: gameId,
      expansions,
      hash,
    });
  },
});

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
    // The expansion links ride along with the item we already fetched, so the
    // admin can see what BGG lists without another round trip. Reported only —
    // the refresh cron is what actually records them.
    const links = parseExpansionLinks(block).slice(0, MAX_EXPANSION_LINKS);
    const knownIds: string[] = await ctx.runQuery(internal.games.knownBggIds, {
      bggIds: links.map((l) => l.bggId),
    });
    const known = new Set(knownIds);

    // Rating counts for the picker. BGG's list mixes real expansions with
    // promos, and the rating count is what tells them apart at a glance — so
    // it's worth the extra batched calls (one per 20) on an admin action.
    const stats = new Map<string, { ratingCount: number; year?: string }>();
    for (const group of chunk(links, THING_CHUNK)) {
      const items = itemsById(
        await fetchThing(
          group.map((g) => g.bggId),
          true,
        ),
      );
      for (const l of group) {
        const b = items.get(l.bggId);
        if (!b) continue;
        stats.set(l.bggId, {
          ratingCount: parseItem(b).ratingCount ?? 0,
          year: parseFullItem(b).year,
        });
      }
    }

    const expansions = links
      .map((l) => ({
        bggId: l.bggId,
        name: l.name,
        inLibrary: known.has(l.bggId),
        ratingCount: stats.get(l.bggId)?.ratingCount ?? 0,
        year: stats.get(l.bggId)?.year ?? null,
        // What the nightly pass would take on its own — the picker's default.
        suggested:
          known.has(l.bggId) ||
          (stats.get(l.bggId)?.ratingCount ?? 0) >= MIN_EXPANSION_RATINGS,
      }))
      // Most-rated first: the real expansions rise, promos sink.
      .sort((a, b) => b.ratingCount - a.ratingCount);

    return {
      ...parseFullItem(block),
      bggId: id,
      bgg: { ...parseItem(block), fetchedAt: Date.now() },
      expansions,
      // Fingerprint of the full list, handed back so a later record() can stamp
      // the same one and stop the nightly pass re-adding unticked entries.
      expansionsHash: expansionsFingerprint(links.map((l) => l.bggId)),
    };
  },
});
