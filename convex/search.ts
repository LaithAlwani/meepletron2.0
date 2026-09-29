import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin } from "./lib/auth";

/** Record a library search term (normalized). Called by the search UI, debounced. */
export const logSearch = mutation({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    const norm = term.trim().toLowerCase();
    if (norm.length < 2) return;
    const now = Date.now();
    const existing = await ctx.db
      .query("searches")
      .withIndex("by_query", (q) => q.eq("query", norm))
      .unique();
    if (existing) {
      await ctx.db.patch("searches", existing._id, {
        count: existing.count + 1,
        lastSearchedAt: now,
      });
    } else {
      await ctx.db.insert("searches", { query: norm, count: 1, lastSearchedAt: now });
    }
  },
});

/** Recent search terms, most-recent first (admin). */
export const topSearches = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("searches").take(2000);
    return rows
      .sort(
        (a, b) =>
          (b.lastSearchedAt ?? b._creationTime) -
          (a.lastSearchedAt ?? a._creationTime),
      )
      .slice(0, 200);
  },
});

const CLEAR_BATCH = 256;

/** Delete every logged search term (admin). Batched so a large table can't
 *  blow the mutation's write limit — the continuation runs unauthenticated as
 *  an internal mutation, so the admin check lives only on this entry point. */
export const clearSearches = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("searches").take(CLEAR_BATCH);
    for (const r of rows) await ctx.db.delete("searches", r._id);
    if (rows.length === CLEAR_BATCH) {
      await ctx.scheduler.runAfter(0, internal.search.clearSearchesBatch, {});
    }
    return null;
  },
});

export const clearSearchesBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("searches").take(CLEAR_BATCH);
    for (const r of rows) await ctx.db.delete("searches", r._id);
    if (rows.length === CLEAR_BATCH) {
      await ctx.scheduler.runAfter(0, internal.search.clearSearchesBatch, {});
    }
  },
});
