import { v, ConvexError } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { bggStatsValidator } from "./lib/bggStats";

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

function num(re: RegExp, s: string): number | undefined {
  const m = s.match(re);
  return m ? Number(m[1]) : undefined;
}

/** Parse the stats + suggested-players poll out of one BGG `<item>` block. */
function parseItem(block: string) {
  const rating = num(/<average value="([\d.]+)"/, block);
  const ratingCount = num(/<usersrated value="(\d+)"/, block);
  const weight = num(/<averageweight value="([\d.]+)"/, block);

  const pollMatch = block.match(
    /<poll name="suggested_numplayers"[\s\S]*?<\/poll>/,
  );
  // Total number of poll voters (each votes across one or more player counts).
  const pollVotes = pollMatch
    ? num(/totalvotes="(\d+)"/, pollMatch[0])
    : undefined;
  const playerPoll: {
    count: number;
    plus?: boolean;
    best: number;
    recommended: number;
    notRecommended: number;
  }[] = [];
  if (pollMatch) {
    const re = /<results numplayers="([^"]+)">([\s\S]*?)<\/results>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(pollMatch[0]))) {
      // Buckets are "1".."N" and a trailing "N+" (e.g. "6+"); keep both, skip
      // anything non-numeric. "6+" is stored as { count: 6, plus: true }.
      const bucket = m[1].match(/^(\d+)(\+)?$/);
      if (!bucket) continue;
      const inner = m[2];
      playerPoll.push({
        count: Number(bucket[1]),
        ...(bucket[2] ? { plus: true } : {}),
        best: num(/value="Best" numvotes="(\d+)"/, inner) ?? 0,
        recommended: num(/value="Recommended" numvotes="(\d+)"/, inner) ?? 0,
        notRecommended:
          num(/value="Not Recommended" numvotes="(\d+)"/, inner) ?? 0,
      });
    }
  }

  return {
    rating,
    ratingCount,
    weight,
    pollVotes,
    playerPoll: playerPoll.length ? playerPoll : undefined,
  };
}

/** Decode the HTML entities BGG uses in names/descriptions. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Parse the full editable metadata from a BGG /thing item block. */
function parseFullItem(block: string) {
  const pos = (n?: number) => (n && n > 0 ? n : undefined);
  const strVal = (re: RegExp) => {
    const m = block.match(re);
    return m ? decodeEntities(m[1]).trim() : undefined;
  };
  const links = (type: string) => {
    const out: string[] = [];
    const re = new RegExp(`<link type="${type}"[^>]*value="([^"]*)"`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) out.push(decodeEntities(m[1]).trim());
    return out;
  };
  const playing = num(/<playingtime value="(\d+)"/, block);
  const year = strVal(/<yearpublished value="([^"]*)"/);
  const age = strVal(/<minage value="(\d+)"/);
  const descMatch = block.match(/<description>([\s\S]*?)<\/description>/);
  const image =
    block.match(/<image>([^<]+)<\/image>/)?.[1] ??
    block.match(/<thumbnail>([^<]+)<\/thumbnail>/)?.[1];
  return {
    imageUrl: image ? decodeEntities(image).trim() : undefined,
    title:
      strVal(/<name type="primary"[^>]*value="([^"]*)"/) ??
      strVal(/<name[^>]*value="([^"]*)"/),
    year: year && year !== "0" ? year : undefined,
    minPlayers: pos(num(/<minplayers value="(\d+)"/, block)),
    maxPlayers: pos(num(/<maxplayers value="(\d+)"/, block)),
    minPlayTime: pos(num(/<minplaytime value="(\d+)"/, block) ?? playing),
    maxPlayTime: pos(num(/<maxplaytime value="(\d+)"/, block) ?? playing),
    minAge: age && age !== "0" ? age : undefined,
    description: descMatch
      ? decodeEntities(descMatch[1]).replace(/\n{3,}/g, "\n\n").trim() ||
        undefined
      : undefined,
    designers: links("boardgamedesigner"),
    artists: links("boardgameartist"),
    publishers: links("boardgamepublisher"),
    categories: links("boardgamecategory"),
    gameMechanics: links("boardgamemechanic"),
  };
}

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
