import { v, ConvexError } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";

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
 * Lazy, TTL-gated refresh of one game's BGG stats — fired when its detail page
 * is viewed and the cache is stale. No-op when fresh, when the game has no
 * bggId, or when the token isn't configured. A failed fetch leaves the cached
 * value untouched (the DB is always the read source).
 */
export const refreshOne = action({
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
      if (!res.ok) return;
      const xml = await res.text();
      const block = xml.match(/<item [\s\S]*?<\/item>/)?.[0];
      if (!block) return;
      await ctx.runMutation(internal.bgg.setBggStats, {
        gameId,
        bgg: { ...parseItem(block), fetchedAt: Date.now() },
      });
    } catch {
      // Leave the cached stats as-is.
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
