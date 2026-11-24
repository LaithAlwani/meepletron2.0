import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";

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
