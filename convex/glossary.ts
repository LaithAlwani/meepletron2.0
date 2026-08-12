import { v } from "convex/values";
import {
  query,
  action,
  mutation,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { generateObject } from "ai";
import { z } from "zod";
import { CHAT_MODEL } from "./rag";
import { embedQuery } from "./lib/embedding";
import { requireAdmin } from "./lib/auth";

const NO_THINK = {
  google: { thinkingConfig: { thinkingBudget: 0 } },
} as const;

/** This game's OWN ingested rulebook ids (never the whole family). */
export const ownRulebookIds = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const rbs = await ctx.db
      .query("rulebooks")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    return rbs
      .filter((rb) => rb.isIngested && (rb.kind ?? "rulebook") !== "download")
      .map((rb) => rb._id);
  },
});

/**
 * Extract a game's component list ("what's in the box") from its rulebook's
 * Contents/Components section (found via vector search) in one Gemini pass.
 *
 * Components are strictly per-game: a base game and each of its expansions each
 * describe their OWN box, so we look only at THIS game's own rulebook and store
 * the result under THIS game's id — expansion contents never merge into the base.
 */
export const generateForGame = internalAction({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<{ components: number }> => {
    const rulebookIds = await ctx.runQuery(internal.glossary.ownRulebookIds, {
      gameId,
    });
    if (rulebookIds.length === 0) {
      await ctx.runMutation(internal.glossary.replaceComponents, {
        gameId,
        components: [],
      });
      return { components: 0 };
    }

    let components: { item: string; count: number }[] = [];
    const { embedding } = await embedQuery(
      "components contents what's in the box list of pieces and quantities",
    );
    const hits = await ctx.vectorSearch("chunks", "by_embedding", {
      vector: embedding,
      limit: 6,
      filter: (q) => {
        const e = rulebookIds.map((id) => q.eq("rulebookId", id));
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

    await ctx.runMutation(internal.glossary.replaceComponents, {
      gameId,
      components,
    });
    return { components: components.length };
  },
});

export const replaceComponents = internalMutation({
  args: {
    gameId: v.id("games"),
    components: v.array(v.object({ item: v.string(), count: v.number() })),
  },
  handler: async (ctx, { gameId, components }) => {
    for (const c of await ctx.db
      .query("gameComponents")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect()) {
      await ctx.db.delete("gameComponents", c._id);
    }
    let o = 0;
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

/** Admin: manually save a game's component list (edits the AI's output). */
export const adminSaveComponents = mutation({
  args: {
    gameId: v.id("games"),
    components: v.array(v.object({ item: v.string(), count: v.number() })),
  },
  handler: async (ctx, { gameId, components }) => {
    await requireAdmin(ctx);
    for (const c of await ctx.db
      .query("gameComponents")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect()) {
      await ctx.db.delete("gameComponents", c._id);
    }
    let o = 0;
    for (const c of components) {
      const item = c.item.trim();
      if (!item) continue;
      await ctx.db.insert("gameComponents", {
        gameId,
        item,
        count: Math.max(1, Math.round(c.count || 1)),
        order: o++,
      });
    }
  },
});

/** Admin trigger to (re)generate a game's component list. */
export const adminRegenerate = action({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<{ components: number }> => {
    await ctx.runQuery(internal.users.ensureAdmin, {});
    return await ctx.runAction(internal.glossary.generateForGame, { gameId });
  },
});

/** This game's own components ("In the box"). Null when none are stored. */
export const componentsForGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const rows = await ctx.db
      .query("gameComponents")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    rows.sort((a, b) => a.order - b.order);
    if (rows.length === 0) return null;
    return {
      count: rows.length,
      items: rows.map((r) => ({ item: r.item, count: r.count })),
    };
  },
});
