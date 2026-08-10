import { v } from "convex/values";
import {
  query,
  action,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { generateObject } from "ai";
import { z } from "zod";
import { CHAT_MODEL } from "./rag";
import { embedQuery } from "./lib/embedding";

/**
 * Generate a per-game "rules refresher": the easily-forgotten, nitty-gritty
 * facts a returning player wants — starting resources, hand limits, tie-breakers,
 * turn-order edge cases, end-game trigger, and specific scoring amounts. Pulled
 * from the ingested rulebook via vector search, then extracted in one pass.
 */
export const generateForGame = internalAction({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<{ reminders: number }> => {
    const setup = await ctx.runQuery(internal.faqs.faqSetup, { gameId });
    if (!setup || setup.rulebookIds.length === 0) return { reminders: 0 };

    // Retrieve the chunks most likely to hold the forgettable specifics.
    const { embedding } = await embedQuery(
      "starting resources setup money cards hand limit tie-breaker turn order end of game trigger final scoring points commonly forgotten rules",
    );
    const hits = await ctx.vectorSearch("chunks", "by_embedding", {
      vector: embedding,
      limit: 12,
      filter: (q) => {
        const e = setup.rulebookIds.map((id) => q.eq("rulebookId", id));
        return e.length === 1 ? e[0] : q.or(...e);
      },
    });
    const hydrated = await ctx.runQuery(internal.chat.hydrateChunks, {
      chunkIds: hits.map((h) => h._id),
    });
    const context = hydrated
      .filter((c) => c.chunkType !== "legend")
      .map((c) => `${c.breadcrumb || ""}\n${c.text}`)
      .join("\n\n---\n\n")
      .slice(0, 16000);
    if (!context.trim()) return { reminders: 0 };

    let reminders: { label: string; detail: string }[] = [];
    try {
      const { object } = await generateObject({
        model: CHAT_MODEL,
        schema: z.object({
          reminders: z.array(
            z.object({ label: z.string(), detail: z.string() }),
          ),
        }),
        prompt: `You are building a "rules refresher" for a board game — the small, nitty-gritty details a player forgets after not playing for a few months. From the rulebook excerpts below, extract 4–10 such facts. Good candidates: starting resources/money/cards each player begins with, hand/supply limits, tie-breaker rules, turn-order edge cases, what triggers the end of the game, specific end-game scoring amounts, and rules people commonly misremember.

Each item: a short "label" (2–5 words, e.g. "Starting money", "Ties", "Hand limit", "Game end") and a one-sentence "detail" with the concrete rule — prefer exact numbers. ONLY use facts stated in the excerpts; do not invent or generalize. If a fact isn't in the excerpts, leave it out. Return an empty array if none apply.

RULEBOOK EXCERPTS:
${context}`,
        providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      });
      reminders = object.reminders
        .filter((r) => r.label.trim() && r.detail.trim())
        .map((r) => ({ label: r.label.trim(), detail: r.detail.trim() }))
        .slice(0, 12);
    } catch {
      /* leave empty on failure */
    }

    await ctx.runMutation(internal.reminders.replaceReminders, {
      gameId: setup.baseGameId,
      reminders,
    });
    return { reminders: reminders.length };
  },
});

export const replaceReminders = internalMutation({
  args: {
    gameId: v.id("games"),
    reminders: v.array(v.object({ label: v.string(), detail: v.string() })),
  },
  handler: async (ctx, { gameId, reminders }) => {
    for (const r of await ctx.db
      .query("gameReminders")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect()) {
      await ctx.db.delete("gameReminders", r._id);
    }
    let o = 0;
    for (const r of reminders) {
      await ctx.db.insert("gameReminders", {
        gameId,
        label: r.label,
        detail: r.detail,
        order: o++,
      });
    }
  },
});

export const adminRegenerate = action({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<{ reminders: number }> => {
    await ctx.runQuery(internal.users.ensureAdmin, {});
    return await ctx.runAction(internal.reminders.generateForGame, { gameId });
  },
});

export const listForGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get("games", gameId);
    if (!game) return [];
    const baseId = game.isExpansion && game.parentId ? game.parentId : game._id;
    const rows = await ctx.db
      .query("gameReminders")
      .withIndex("by_game", (q) => q.eq("gameId", baseId))
      .collect();
    rows.sort((a, b) => a.order - b.order);
    return rows.map((r) => ({ label: r.label, detail: r.detail }));
  },
});
