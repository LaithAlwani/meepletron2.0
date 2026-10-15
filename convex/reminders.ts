import { v } from "convex/values";
import {
  query,
  action,
  mutation,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { generateObject } from "ai";
import { z } from "zod";
import { resolveContentModel } from "./rag";
import { embedQuery } from "./lib/embedding";
import { requireAdmin } from "./lib/auth";

/**
 * Generate a per-game "rules refresher": the easily-forgotten, nitty-gritty
 * facts a returning player wants — starting resources, hand limits, tie-breakers,
 * turn-order edge cases, end-game trigger, and specific scoring amounts. Pulled
 * from the ingested rulebook via vector search, then extracted in one pass.
 */
export const generateForGame = internalAction({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<{ reminders: number }> => {
    // Per-game (own rulebook only) so a base game's refresher never mixes in
    // expansion rules.
    const setup = await ctx.runQuery(internal.faqs.ownFaqSetup, { gameId });
    if (!setup || setup.rulebookIds.length === 0) {
      await ctx.runMutation(internal.reminders.replaceReminders, {
        gameId,
        reminders: [],
      });
      return { reminders: 0 };
    }

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
      const { model } = await resolveContentModel(ctx);
      const { object } = await generateObject({
        model,
        schema: z.object({
          reminders: z.array(
            z.object({ label: z.string(), detail: z.string() }),
          ),
        }),
        prompt: `You are building a "rules refresher" for a board game — the small, nitty-gritty details a player forgets after not playing for a few months. From the rulebook excerpts below, extract 4–10 such facts. Good candidates: starting resources/money/cards each player begins with, hand/supply limits, tie-breaker rules, turn-order edge cases, what triggers the end of the game, specific end-game scoring amounts, and rules people commonly misremember.

Each item: a short "label" (2–5 words, e.g. "Starting money", "Ties", "Hand limit", "Game end") and a one-sentence "detail" with the concrete rule — prefer exact numbers.

Grounding rules:
- UNDER NO CIRCUMSTANCES state anything that is not in the excerpts. Not a clarification, not an example, not an edge case, not a "usually". If it is not in the excerpts below, it does not go in the output. This overrides everything else here, including returning a useful number of items.
- Every DETAIL must be traceable to the excerpts in full — not just its opening. A detail that starts with a real rule and then runs on into something the excerpts don't state is a fabrication, however obvious the continuation sounds, and the true first half is exactly what makes the invented second half credible. Check the whole sentence before you keep it.
- NEVER finish a rule the excerpts leave open. If they give a tie-breaker but not what happens when players are STILL tied, the detail is the tie-breaker alone — stop where the text stops. Never append what "then" happens, and never fall back on how other board games handle it.
- Never infer a number. Use only quantities the excerpts actually state; do not calculate, scale by player count, or supply a number that looks right.
- Recognising the game is not a source. If you know this game and remember a rule, that memory licenses nothing — only the excerpts do. Where memory would fill a gap the excerpts leave, the gap stays and the item is dropped.
- Fewer, fully-supported items beat a longer list. Returning 4 solid facts — or an empty array — is correct and expected when that is all the excerpts support.

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
      gameId,
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

/** Admin: manually save a game's rules-refresher list (edit the AI's output). */
export const adminSaveReminders = mutation({
  args: {
    gameId: v.id("games"),
    reminders: v.array(v.object({ label: v.string(), detail: v.string() })),
  },
  handler: async (ctx, { gameId, reminders }) => {
    await requireAdmin(ctx);
    for (const r of await ctx.db
      .query("gameReminders")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect()) {
      await ctx.db.delete("gameReminders", r._id);
    }
    let o = 0;
    for (const r of reminders) {
      const label = r.label.trim();
      const detail = r.detail.trim();
      if (!label || !detail) continue;
      await ctx.db.insert("gameReminders", { gameId, label, detail, order: o++ });
    }
  },
});

export const listForGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const rows = await ctx.db
      .query("gameReminders")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    rows.sort((a, b) => a.order - b.order);
    return rows.map((r) => ({ label: r.label, detail: r.detail }));
  },
});
