import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getCurrentUser, requireUser } from "./lib/auth";

/** Toggle a game as a favourite for the current user. Returns the new state. */
export const toggle = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<boolean> => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("favorites")
      .withIndex("by_user_and_game", (q) =>
        q.eq("userId", user._id).eq("gameId", gameId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete("favorites", existing._id);
      return false;
    }
    await ctx.db.insert("favorites", { userId: user._id, gameId });
    return true;
  },
});

/** Whether the current user has favourited a game. */
export const isFavorited = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return false;
    const existing = await ctx.db
      .query("favorites")
      .withIndex("by_user_and_game", (q) =>
        q.eq("userId", user._id).eq("gameId", gameId),
      )
      .unique();
    return existing !== null;
  },
});

/** The current user's favourited games (with cover). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const favs = await ctx.db
      .query("favorites")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(200);

    const out = [];
    for (const f of favs) {
      const game = await ctx.db.get("games", f.gameId);
      if (!game) continue;
      const mediaId = game.thumbnailId ?? game.imageId;
      out.push({
        gameId: game._id,
        title: game.title,
        thumbnailUrl: mediaId ? await ctx.storage.getUrl(mediaId) : null,
      });
    }
    return out;
  },
});
