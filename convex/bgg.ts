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
