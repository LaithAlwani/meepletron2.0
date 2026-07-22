import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

/** Record a library search term (normalized). Called by the search UI, debounced. */
export const logSearch = mutation({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    const norm = term.trim().toLowerCase();
    if (norm.length < 2) return;
    const existing = await ctx.db
      .query("searches")
      .withIndex("by_query", (q) => q.eq("query", norm))
      .unique();
    if (existing) {
      await ctx.db.patch("searches", existing._id, { count: existing.count + 1 });
    } else {
      await ctx.db.insert("searches", { query: norm, count: 1 });
    }
  },
});

/** Top search terms by frequency (admin). */
export const topSearches = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("searches").take(2000);
    return rows.sort((a, b) => b.count - a.count).slice(0, 100);
  },
});
