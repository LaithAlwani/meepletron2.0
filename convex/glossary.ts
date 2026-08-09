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

const NO_THINK = {
  google: { thinkingConfig: { thinkingBudget: 0 } },
} as const;

/**
 * Extract a per-game glossary (from the rulebook's legend/iconography chunks)
 * and component list (from the "Contents"/"Components" section, found via vector
 * search), both by one Gemini pass. Cached; regenerated on demand.
 */
export const generateForGame = internalAction({
  args: { gameId: v.id("games") },
  handler: async (
    ctx,
    { gameId },
  ): Promise<{ terms: number; components: number }> => {
    const setup = await ctx.runQuery(internal.faqs.faqSetup, { gameId });
    if (!setup || setup.rulebookIds.length === 0) {
      return { terms: 0, components: 0 };
    }

    // --- Glossary from legend/iconography chunks (fall back to vector search
    //     for an icon/glossary section when none were flagged during ingestion) ---
    let terms: { term: string; definition: string }[] = [];
    const legend = await ctx.runQuery(internal.chat.getLegendChunks, {
      rulebookIds: setup.rulebookIds,
    });
    let legendText = legend
      .map((c) => c.text)
      .join("\n\n")
      .slice(0, 12000);
    if (!legendText.trim()) {
      const { embedding: gEmbed } = await embedQuery(
        "iconography key icons symbols and their meanings glossary of terms",
      );
      const gHits = await ctx.vectorSearch("chunks", "by_embedding", {
        vector: gEmbed,
        limit: 5,
        filter: (q) => {
          const e = setup.rulebookIds.map((id) => q.eq("rulebookId", id));
          return e.length === 1 ? e[0] : q.or(...e);
        },
      });
      const gHyd = await ctx.runQuery(internal.chat.hydrateChunks, {
        chunkIds: gHits.map((h) => h._id),
      });
      legendText = gHyd
        .map((c) => c.text)
        .join("\n\n")
        .slice(0, 12000);
    }
    if (legendText.trim()) {
      try {
        const { object } = await generateObject({
          model: CHAT_MODEL,
          schema: z.object({
            terms: z.array(
              z.object({ term: z.string(), definition: z.string() }),
            ),
          }),
          prompt: `From the board game rulebook glossary / iconography / legend section(s) below, extract each distinct game term or icon and a concise one-sentence definition. Only include entries that are actually defined here. Do not invent terms.\n\n${legendText}`,
          providerOptions: NO_THINK,
        });
        terms = object.terms
          .filter((t) => t.term.trim() && t.definition.trim())
          .slice(0, 60);
      } catch {
        /* leave terms empty on failure */
      }
    }

    // --- Components via vector search for the "contents" section ---
    let components: { item: string; count: number }[] = [];
    const { embedding } = await embedQuery(
      "components contents what's in the box list of pieces and quantities",
    );
    const hits = await ctx.vectorSearch("chunks", "by_embedding", {
      vector: embedding,
      limit: 6,
      filter: (q) => {
        const e = setup.rulebookIds.map((id) => q.eq("rulebookId", id));
        return e.length === 1 ? e[0] : q.or(...e);
      },
    });
    const hydrated = await ctx.runQuery(internal.chat.hydrateChunks, {
      chunkIds: hits.map((h) => h._id),
    });
    const compText = hydrated
      .map((c) => c.text)
      .join("\n\n")
      .slice(0, 12000);
    if (compText.trim()) {
      try {
        const { object } = await generateObject({
          model: CHAT_MODEL,
          schema: z.object({
            components: z.array(
              z.object({ item: z.string(), count: z.number() }),
            ),
          }),
          prompt: `From the board game rulebook excerpt below, extract the physical components in the box (the "Components"/"Contents" list) with their quantities. Give each item's name and its integer count; if no quantity is stated use 1. Only include real physical components — not rules, phases, or icons. If the excerpt has no component list, return an empty array.\n\n${compText}`,
          providerOptions: NO_THINK,
        });
        components = object.components
          .filter((c) => c.item.trim() && Number.isFinite(c.count))
          .map((c) => ({ item: c.item.trim(), count: Math.round(c.count) }))
          .slice(0, 60);
      } catch {
        /* leave components empty on failure */
      }
    }

    await ctx.runMutation(internal.glossary.replaceDerived, {
      gameId: setup.baseGameId,
      terms,
      components,
    });
    return { terms: terms.length, components: components.length };
  },
});

export const replaceDerived = internalMutation({
  args: {
    gameId: v.id("games"),
    terms: v.array(v.object({ term: v.string(), definition: v.string() })),
    components: v.array(v.object({ item: v.string(), count: v.number() })),
  },
  handler: async (ctx, { gameId, terms, components }) => {
    for (const t of await ctx.db
      .query("glossaryTerms")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect()) {
      await ctx.db.delete("glossaryTerms", t._id);
    }
    let o = 0;
    for (const t of terms) {
      await ctx.db.insert("glossaryTerms", {
        gameId,
        term: t.term,
        definition: t.definition,
        order: o++,
      });
    }

    for (const c of await ctx.db
      .query("gameComponents")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect()) {
      await ctx.db.delete("gameComponents", c._id);
    }
    o = 0;
    for (const c of components) {
      await ctx.db.insert("gameComponents", {
        gameId,
        item: c.item,
        count: c.count,
        order: o++,
      });
    }
  },
});

/** Admin trigger to (re)generate a game's glossary + components. */
export const adminRegenerate = action({
  args: { gameId: v.id("games") },
  handler: async (
    ctx,
    { gameId },
  ): Promise<{ terms: number; components: number }> => {
    await ctx.runQuery(internal.users.ensureAdmin, {});
    return await ctx.runAction(internal.glossary.generateForGame, { gameId });
  },
});

export const glossaryForGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get("games", gameId);
    if (!game) return [];
    const baseId = game.isExpansion && game.parentId ? game.parentId : game._id;
    const rows = await ctx.db
      .query("glossaryTerms")
      .withIndex("by_game", (q) => q.eq("gameId", baseId))
      .collect();
    rows.sort((a, b) => a.order - b.order);
    return rows.map((r) => ({ term: r.term, definition: r.definition }));
  },
});

export const componentsForGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get("games", gameId);
    if (!game) return null;
    const baseId = game.isExpansion && game.parentId ? game.parentId : game._id;
    const rows = await ctx.db
      .query("gameComponents")
      .withIndex("by_game", (q) => q.eq("gameId", baseId))
      .collect();
    rows.sort((a, b) => a.order - b.order);
    if (rows.length === 0) return null;
    return {
      count: rows.length,
      items: rows.map((r) => ({ item: r.item, count: r.count })),
    };
  },
});
