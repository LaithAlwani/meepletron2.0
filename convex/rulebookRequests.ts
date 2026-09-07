import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser, requireAdmin } from "./lib/auth";
import { thumbUrl } from "./lib/gameCover";

/**
 * Request counts per game, keyed by gameId, for games that DON'T yet have an
 * ingested rulebook (fulfilled requests are excluded). Shared by the admin list
 * and the nav badge count.
 */
async function pendingCounts(
  ctx: QueryCtx,
): Promise<Map<Id<"games">, number>> {
  const rows = await ctx.db.query("rulebookRequests").take(5000);
  const counts = new Map<Id<"games">, number>();
  for (const r of rows) counts.set(r.gameId, (counts.get(r.gameId) ?? 0) + 1);
  for (const gameId of [...counts.keys()]) {
    const game = await ctx.db.get("games", gameId);
    const ingested =
      game &&
      (await ctx.db
        .query("rulebooks")
        .withIndex("by_game", (q) => q.eq("gameId", gameId))
        .filter((q) => q.eq(q.field("isIngested"), true))
        .first());
    if (!game || ingested) counts.delete(gameId);
  }
  return counts;
}

/**
 * Record that the caller wants this game's rulebook added + ingested. Deduped per
 * user (one row per game/user), so the admin count reflects unique demand.
 */
export const requestRulebook = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("rulebookRequests")
      .withIndex("by_game_and_user", (q) =>
        q.eq("gameId", gameId).eq("userId", user._id),
      )
      .unique();
    if (existing) return { alreadyRequested: true };
    await ctx.db.insert("rulebookRequests", {
      gameId,
      userId: user._id,
      createdAt: Date.now(),
    });
    return { alreadyRequested: false };
  },
});

/**
 * Admin: games with pending rulebook requests, most-requested first. A game drops
 * off once it has an ingested rulebook (the request is fulfilled).
 */
export const listRequests = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const counts = await pendingCounts(ctx);
    const items: {
      gameId: Id<"games">;
      slug: string;
      title: string;
      thumbUrl: string | null;
      count: number;
    }[] = [];
    for (const [gameId, count] of counts) {
      const game = await ctx.db.get("games", gameId);
      if (!game) continue;
      items.push({
        gameId,
        slug: game.slug,
        title: game.title,
        thumbUrl: await thumbUrl(ctx, game),
        count,
      });
    }
    items.sort((a, b) => b.count - a.count);
    return items;
  },
});

/** Admin: number of games with pending (unfulfilled) rulebook requests — for the
 *  nav badge. */
export const pendingRequestCount = query({
  args: {},
  handler: async (ctx): Promise<number> => {
    await requireAdmin(ctx);
    return (await pendingCounts(ctx)).size;
  },
});
