import { v } from "convex/values";
import {
  query,
  action,
  mutation,
  internalQuery,
  internalMutation,
  internalAction,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { generateObject } from "ai";
import { z } from "zod";
import { resolveContentModel } from "./rag";
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

/** A component as accepted from the AI / admin editor: a name + count, with an
 *  optional one-level breakdown of sub-types (whose counts sum to the parent). */
const componentArg = v.object({
  item: v.string(),
  count: v.number(),
  children: v.optional(
    v.array(v.object({ item: v.string(), count: v.number() })),
  ),
});

type RawComponent = {
  item: string;
  count: number;
  children?: { item: string; count: number }[];
};

/** Clean a component list: trim names, drop blanks, clamp counts to ≥1, and —
 *  when an item has sub-items — force its count to the sum of its children (the
 *  total is always its breakdown added up). Nesting is one level deep. */
function normalizeComponents(components: RawComponent[]): RawComponent[] {
  const out: RawComponent[] = [];
  for (const c of components) {
    const item = c.item.trim();
    if (!item) continue;
    const children = (c.children ?? [])
      .map((ch) => ({
        item: ch.item.trim(),
        count: Math.max(1, Math.round(ch.count || 1)),
      }))
      .filter((ch) => ch.item);
    if (children.length) {
      out.push({
        item,
        count: children.reduce((s, ch) => s + ch.count, 0),
        children,
      });
    } else {
      out.push({ item, count: Math.max(1, Math.round(c.count || 1)) });
    }
  }
  return out;
}

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

    let components: RawComponent[] = [];
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
        const { model } = await resolveContentModel(ctx);
        const { object } = await generateObject({
          model,
          schema: z.object({
            components: z.array(
              z.object({
                item: z.string(),
                count: z.number(),
                children: z
                  .array(z.object({ item: z.string(), count: z.number() }))
                  .optional(),
              }),
            ),
          }),
          prompt: `From the board game rulebook excerpt below, extract the physical components in the box (the "Components"/"Contents" list) with their quantities. Give each item's name and its integer count. Only include real physical components — not rules, phases, or icons.

When the list gives a total and then breaks it into sub-types — e.g. "74 player cards (48 X, 14 Y, 12 Z)" — return it as ONE item named for the total ("Player cards") with a "children" array holding each sub-type and its count. The children's counts must add up to the parent. Only nest when the excerpt itself presents a total-and-breakdown; nest at most ONE level (children have no children of their own); and never invent sub-types.

Grounding rules:
- UNDER NO CIRCUMSTANCES list a component that is not named in the excerpt. Never add a piece because a game of this kind would normally include it, and never expand one entry into several.
- Use ONLY quantities the excerpt states. Do not infer a count from the rules, from the player count, or from what you know of the game. Where an item is listed with no number at all, use 1 — that is the only count you may supply, and only in that case.
- Recognising the game is not a source. Remembering what is in this box licenses nothing; only the excerpt does.
- If the excerpt has no component list, return an empty array. An empty array is a correct answer — a plausible guessed list is not.

RULEBOOK EXCERPT:
${compText}`,
          providerOptions: NO_THINK,
        });
        components = normalizeComponents(object.components).slice(0, 60);
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

/** Delete a game's stored components and reinsert the normalized list (the
 *  shared write path for the generator and the admin editor). */
async function writeComponents(
  ctx: MutationCtx,
  gameId: Id<"games">,
  components: RawComponent[],
) {
  for (const c of await ctx.db
    .query("gameComponents")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect()) {
    await ctx.db.delete("gameComponents", c._id);
  }
  let o = 0;
  for (const c of normalizeComponents(components)) {
    await ctx.db.insert("gameComponents", {
      gameId,
      item: c.item,
      count: c.count,
      order: o++,
      ...(c.children ? { children: c.children } : {}),
    });
  }
}

export const replaceComponents = internalMutation({
  args: { gameId: v.id("games"), components: v.array(componentArg) },
  handler: async (ctx, { gameId, components }) => {
    await writeComponents(ctx, gameId, components);
  },
});

/** Admin: manually save a game's component list (edits the AI's output). */
export const adminSaveComponents = mutation({
  args: { gameId: v.id("games"), components: v.array(componentArg) },
  handler: async (ctx, { gameId, components }) => {
    await requireAdmin(ctx);
    await writeComponents(ctx, gameId, components);
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
      // Top-level line items only — sub-items don't inflate the count.
      count: rows.length,
      items: rows.map((r) => ({
        item: r.item,
        count: r.count,
        children: r.children ?? [],
      })),
    };
  },
});
