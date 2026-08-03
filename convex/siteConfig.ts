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
  // How many of the top-scoring candidates actually reach the reranker.
  rerankCandidates: 12,
};

/** The current RAG-tuning knobs (admin). Defaults fill any missing fields. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("siteConfig").order("desc").take(1);
    return { ...DEFAULTS, ...rows[0] };
  },
});

/** Update (or create) the singleton RAG-tuning row. */
export const update = mutation({
  args: {
    v2TopK: v.number(),
    v2ScoreThreshold: v.number(),
    rerankTopN: v.number(),
    historyMessageLimit: v.number(),
    rerankCandidates: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (
      args.v2TopK < 1 ||
      args.rerankTopN < 1 ||
      args.historyMessageLimit < 0 ||
      args.rerankCandidates < 1
    ) {
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
    rerankCandidates: v.optional(v.number()),
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
