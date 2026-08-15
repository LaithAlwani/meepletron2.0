import { v, ConvexError } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { bggStatsValidator } from "./lib/bggStats";
import { parseItem, parseFullItem } from "./lib/bggThing";

export const setBggStats = internalMutation({
  args: { gameId: v.id("games"), bgg: bggStatsValidator },
  handler: async (ctx, { gameId, bgg }) => {
    await ctx.db.patch("games", gameId, { bgg, bggCheckedAt: Date.now() });
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
    const now = Date.now();
    const games = await ctx.db
      .query("games")
      .withIndex("by_isStub_and_isExpansion", (q) => q.eq("isStub", false))
      .take(2000);

    return games
      .filter(
        (g) =>
          !!g.bggId &&
          (!g.bggCheckedAt || now - g.bggCheckedAt >= REFRESH_TTL_MS),
      )
      // Never-checked games sort first (0), then oldest check.
      .sort((a, b) => (a.bggCheckedAt ?? 0) - (b.bggCheckedAt ?? 0))
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
