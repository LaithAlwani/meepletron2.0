import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { CHAT_CONFIG_DEFAULTS } from "./lib/chatConfig";

const modelValidator = v.union(
  v.literal("gemini-2.5-flash"),
  v.literal("gemini-2.5-flash-lite"),
);

const DEFAULTS = CHAT_CONFIG_DEFAULTS;

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
    answerTemperature: v.number(),
    answerModel: modelValidator,
    auxModel: modelValidator,
    answerThinkingBudget: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (
      args.v2TopK < 1 ||
      args.rerankTopN < 1 ||
      args.historyMessageLimit < 1 ||
      args.rerankCandidates < 1 ||
      args.answerTemperature < 0 ||
      args.answerTemperature > 2 ||
      // -1 (dynamic) or 0 (off) or a sane positive cap. Gemini's max is 24576.
      args.answerThinkingBudget < -1 ||
      args.answerThinkingBudget > 24576
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
    answerTemperature: v.optional(v.number()),
    answerModel: v.optional(modelValidator),
    auxModel: v.optional(modelValidator),
    answerThinkingBudget: v.optional(v.number()),
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
