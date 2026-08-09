import { v, ConvexError } from "convex/values";
import {
  query,
  mutation,
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser, requireUser } from "./lib/auth";
import { generateText } from "ai";
import { CHAT_MODEL, buildAnswer, type Annotation } from "./rag";
import { annotationValidator } from "./lib/annotations";

/** Common questions asked of almost any game. Answers are grounded per-game. */
const STARTER_QUESTIONS = [
  "How do you set up the game?",
  "What can you do on your turn?",
  "How do you win the game?",
  "How does scoring work?",
  "How and when does the game end?",
];

/** Resolve a game to its family's ingested rulebook ids + source titles. */
export const faqSetup = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get("games", gameId);
    if (!game) return null;
    const base =
      game.isExpansion && game.parentId
        ? ((await ctx.db.get("games", game.parentId)) ?? game)
        : game;
    const family = [
      base,
      ...(await ctx.db
        .query("games")
        .withIndex("by_parent", (q) => q.eq("parentId", base._id))
        .collect()),
    ];
    const rulebookIds: Id<"rulebooks">[] = [];
    const titles = new Set<string>();
    for (const g of family) {
      const rbs = await ctx.db
        .query("rulebooks")
        .withIndex("by_game", (q) => q.eq("gameId", g._id))
        .collect();
      for (const rb of rbs) {
        if (rb.isIngested && (rb.kind ?? "rulebook") !== "download") {
          rulebookIds.push(rb._id);
          titles.add(g.title);
        }
      }
    }
    return {
      baseGameId: base._id,
      rulebookIds,
      sourceTitles: [...titles],
    };
  },
});

/** Replace a game's cached FAQ with a freshly generated set. */
export const replaceFaqs = internalMutation({
  args: {
    gameId: v.id("games"),
    faqs: v.array(
      v.object({
        question: v.string(),
        answer: v.string(),
        annotations: v.array(annotationValidator),
      }),
    ),
  },
  handler: async (ctx, { gameId, faqs }) => {
    const existing = await ctx.db
      .query("gameFaqs")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    for (const f of existing) await ctx.db.delete("gameFaqs", f._id);
    let order = 0;
    for (const f of faqs) {
      await ctx.db.insert("gameFaqs", {
        gameId,
        question: f.question,
        answer: f.answer,
        annotations: f.annotations,
        order: order++,
        helpful: 0,
        notHelpful: 0,
      });
    }
  },
});

/**
 * Generate the per-game FAQ by running the starter questions through the shared
 * RAG pipeline (grounded, cited). Skips questions with no rulebook coverage.
 */
export const generateForGame = internalAction({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<{ generated: number }> => {
    const setup = await ctx.runQuery(internal.faqs.faqSetup, { gameId });
    if (!setup || setup.rulebookIds.length === 0) return { generated: 0 };

    const results: {
      question: string;
      answer: string;
      annotations: Annotation[];
    }[] = [];
    for (const question of STARTER_QUESTIONS) {
      const { system, annotations, empty } = await buildAnswer(ctx, {
        rulebookIds: setup.rulebookIds,
        query: question,
        history: [{ role: "user", content: question }],
        sourceTitles: setup.sourceTitles,
      });
      if (empty || !system) continue;
      const { text } = await generateText({
        model: CHAT_MODEL,
        system,
        messages: [{ role: "user", content: question }],
      });
      const answer = text.trim();
      if (answer) results.push({ question, answer, annotations });
    }

    await ctx.runMutation(internal.faqs.replaceFaqs, {
      gameId: setup.baseGameId,
      faqs: results,
    });
    return { generated: results.length };
  },
});

/** Admin trigger to (re)generate a game's FAQ. */
export const adminRegenerate = action({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<{ generated: number }> => {
    await ctx.runQuery(internal.users.ensureAdmin, {});
    return await ctx.runAction(internal.faqs.generateForGame, { gameId });
  },
});

/** The FAQ for the detail page (resolved to the base game), with the caller's votes. */
export const listForGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get("games", gameId);
    if (!game) return [];
    const baseId =
      game.isExpansion && game.parentId ? game.parentId : game._id;
    const faqs = await ctx.db
      .query("gameFaqs")
      .withIndex("by_game", (q) => q.eq("gameId", baseId))
      .collect();
    faqs.sort((a, b) => a.order - b.order);

    const user = await getCurrentUser(ctx);
    return await Promise.all(
      faqs.map(async (f) => {
        let myVote: "up" | "down" | null = null;
        if (user) {
          const existing = await ctx.db
            .query("faqVotes")
            .withIndex("by_user_and_faq", (q) =>
              q.eq("userId", user._id).eq("faqId", f._id),
            )
            .unique();
          myVote = existing?.vote ?? null;
        }
        return {
          _id: f._id,
          question: f.question,
          answer: f.answer,
          annotations: f.annotations,
          helpful: f.helpful,
          notHelpful: f.notHelpful,
          myVote,
        };
      }),
    );
  },
});

/** Cast/toggle a helpfulness vote on a FAQ item (one vote per user). */
export const voteFaq = mutation({
  args: {
    faqId: v.id("gameFaqs"),
    vote: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, { faqId, vote }) => {
    const user = await requireUser(ctx);
    const faq = await ctx.db.get("gameFaqs", faqId);
    if (!faq) throw new ConvexError("That FAQ no longer exists.");
    const existing = await ctx.db
      .query("faqVotes")
      .withIndex("by_user_and_faq", (q) =>
        q.eq("userId", user._id).eq("faqId", faqId),
      )
      .unique();

    let helpful = faq.helpful;
    let notHelpful = faq.notHelpful;
    const inc = (vt: "up" | "down", d: number) => {
      if (vt === "up") helpful = Math.max(0, helpful + d);
      else notHelpful = Math.max(0, notHelpful + d);
    };

    if (!existing) {
      await ctx.db.insert("faqVotes", { userId: user._id, faqId, vote });
      inc(vote, +1);
    } else if (existing.vote === vote) {
      await ctx.db.delete("faqVotes", existing._id);
      inc(vote, -1);
    } else {
      await ctx.db.patch("faqVotes", existing._id, { vote });
      inc(existing.vote, -1);
      inc(vote, +1);
    }
    await ctx.db.patch("gameFaqs", faqId, { helpful, notHelpful });
  },
});
