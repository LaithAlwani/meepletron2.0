import { v, ConvexError } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/** Backfill BoardGameGeek ids from the original import (slug → bgg_id). */
export const setBggIds = internalMutation({
  args: {
    entries: v.array(v.object({ slug: v.string(), bggId: v.string() })),
  },
  handler: async (ctx, { entries }) => {
    let n = 0;
    for (const e of entries) {
      const g = await ctx.db
        .query("games")
        .withIndex("by_slug", (q) => q.eq("slug", e.slug))
        .first();
      if (g) {
        await ctx.db.patch("games", g._id, { bggId: e.bggId });
        n++;
      }
    }
    return n;
  },
});

/** Games that have a bggId but no cached stats yet. */
export const nextToFetch = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const games = await ctx.db.query("games").take(2000);
    const out: { gameId: Id<"games">; bggId: string }[] = [];
    for (const g of games) {
      if (g.bggId && !g.bgg) {
        out.push({ gameId: g._id, bggId: g.bggId });
        if (out.length >= limit) break;
      }
    }
    return out;
  },
});

export const countRemaining = internalQuery({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db.query("games").take(2000);
    return games.filter((g) => g.bggId && !g.bgg).length;
  },
});

const bggValidator = v.object({
  rating: v.optional(v.number()),
  ratingCount: v.optional(v.number()),
  weight: v.optional(v.number()),
  playerPoll: v.optional(
    v.array(
      v.object({
        count: v.number(),
        best: v.number(),
        recommended: v.number(),
        notRecommended: v.number(),
      }),
    ),
  ),
  fetchedAt: v.optional(v.number()),
});

export const setBggStats = internalMutation({
  args: { gameId: v.id("games"), bgg: bggValidator },
  handler: async (ctx, { gameId, bgg }) => {
    await ctx.db.patch("games", gameId, { bgg });
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
  const playerPoll: {
    count: number;
    best: number;
    recommended: number;
    notRecommended: number;
  }[] = [];
  if (pollMatch) {
    const re = /<results numplayers="([^"]+)">([\s\S]*?)<\/results>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(pollMatch[0]))) {
      if (!/^\d+$/.test(m[1])) continue; // skip "N+" buckets
      const inner = m[2];
      playerPoll.push({
        count: Number(m[1]),
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
    playerPoll: playerPoll.length ? playerPoll : undefined,
  };
}

/**
 * Fetch BGG stats for a batch of games (comma-separated ids, `stats=1`), parse
 * the XML, and cache them. Self-reschedules with a delay to respect BGG's rate
 * limits until every game with a bggId has stats.
 */
export const pullStats = internalAction({
  args: { limit: v.optional(v.number()), continue: v.optional(v.boolean()) },
  handler: async (
    ctx,
    { limit, continue: keepGoing },
  ): Promise<{ processed: number; remaining: number }> => {
    const batchSize = Math.min(limit ?? 15, 20);
    const batch = await ctx.runQuery(internal.bgg.nextToFetch, {
      limit: batchSize,
    });
    if (batch.length === 0) return { processed: 0, remaining: 0 };

    const ids = batch.map((b) => b.bggId).join(",");
    let processed = 0;
    // BGG requires a registered app's bearer token since late 2025.
    const token = process.env.BGG_API_TOKEN;
    try {
      const res = await fetch(
        `https://boardgamegeek.com/xmlapi2/thing?id=${ids}&stats=1`,
        {
          headers: {
            "User-Agent": "Meepletron/1.0 (board game rules assistant)",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      );
      if (res.ok) {
        const xml = await res.text();
        const byId = new Map<string, string>();
        for (const part of xml.split(/<item /).slice(1)) {
          const block = "<item " + part.split("</item>")[0];
          const idm = block.match(/id="(\d+)"/);
          if (idm) byId.set(idm[1], block);
        }
        for (const b of batch) {
          const block = byId.get(b.bggId);
          const parsed = block ? parseItem(block) : {};
          await ctx.runMutation(internal.bgg.setBggStats, {
            gameId: b.gameId,
            bgg: { ...parsed, fetchedAt: Date.now() },
          });
          processed++;
        }
      }
    } catch {
      // Transient network/BGG error — leave this batch unfetched to retry.
    }

    const remaining = await ctx.runQuery(internal.bgg.countRemaining, {});
    if (keepGoing && processed > 0 && remaining > 0) {
      await ctx.scheduler.runAfter(2500, internal.bgg.pullStats, {
        limit,
        continue: true,
      });
    }
    return { processed, remaining };
  },
});

/** Admin trigger to start the BGG stats pull. */
export const adminPull = action({
  args: {},
  handler: async (ctx): Promise<{ processed: number; remaining: number }> => {
    await ctx.runQuery(internal.users.ensureAdmin, {});
    if (!process.env.BGG_API_TOKEN) {
      throw new ConvexError(
        "BGG_API_TOKEN is not set. Register an app at boardgamegeek.com to get a bearer token, then run: npx convex env set BGG_API_TOKEN <token> --prod",
      );
    }
    return await ctx.runAction(internal.bgg.pullStats, {
      limit: 15,
      continue: true,
    });
  },
});

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
  return {
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
