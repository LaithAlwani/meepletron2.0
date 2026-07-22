import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

const DEFAULTS = {
  // Retrieve a generous candidate set — the reranker reads the text and picks
  // the best few, so more candidates improves recall for casual phrasing.
  v2TopK: 20,
  v2ScoreThreshold: 0.05,
  rerankTopN: 3,
  historyMessageLimit: 6,
};

/** The current RAG-tuning knobs (admin). */
export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("siteConfig").order("desc").take(1);
    return rows[0] ?? DEFAULTS;
  },
});

/** Update (or create) the singleton RAG-tuning row. */
export const update = mutation({
  args: {
    v2TopK: v.number(),
    v2ScoreThreshold: v.number(),
    rerankTopN: v.number(),
    historyMessageLimit: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.v2TopK < 1 || args.rerankTopN < 1 || args.historyMessageLimit < 0) {
      throw new Error("Invalid config values");
    }
    const existing = await ctx.db.query("siteConfig").order("desc").take(1);
    if (existing[0]) {
      await ctx.db.patch("siteConfig", existing[0]._id, args);
    } else {
      await ctx.db.insert("siteConfig", args);
    }
  },
});

/** Patch the config knobs from a script/maintenance run (no auth). */
export const internalUpdate = internalMutation({
  args: {
    v2TopK: v.optional(v.number()),
    v2ScoreThreshold: v.optional(v.number()),
    rerankTopN: v.optional(v.number()),
    historyMessageLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("siteConfig").order("desc").take(1);
    if (existing[0]) {
      await ctx.db.patch("siteConfig", existing[0]._id, args);
    } else {
      await ctx.db.insert("siteConfig", { ...DEFAULTS, ...args });
    }
  },
});
