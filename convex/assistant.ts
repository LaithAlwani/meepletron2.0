import { v } from "convex/values";
import { generateObject } from "ai";
import { z } from "zod";
import { action, internalMutation, type ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CHAT_MODEL } from "./rag";
import { buildRouterPrompt } from "./lib/assistantPrompt";
import { finite } from "./lib/num";

/**
 * The global assistant's router + usage accounting. Streaming answers themselves
 * go through the `/chat` (per-game, grounded) and `/assistant` (general) HTTP
 * actions; this file just decides where a message should go and resolves the
 * game the user named into confirmable candidates.
 */

type GameCandidate = {
  _id: Id<"games">;
  slug: string;
  title: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  hasRulebooks: boolean;
};

/** Resolve a free-text game name to up to 3 catalogue candidates (+ chat-ability). */
async function resolveCandidates(
  ctx: ActionCtx,
  term: string,
): Promise<GameCandidate[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const res = await ctx.runQuery(api.games.searchPaginated, {
    term: q,
    paginationOpts: { numItems: 3, cursor: null },
  });
  const out: GameCandidate[] = [];
  for (const g of res.page.slice(0, 3)) {
    const sources = await ctx.runQuery(api.games.chatSources, { gameId: g._id });
    out.push({
      _id: g._id,
      slug: g.slug,
      title: g.title,
      imageUrl: g.imageUrl,
      thumbnailUrl: g.thumbnailUrl,
      hasRulebooks: sources.some((s) => s.rulebooks.length > 0),
    });
  }
  return out;
}

type RouteResult = {
  mode: "switch" | "current" | "general";
  gameName?: string;
  candidates: GameCandidate[];
};

/**
 * Classify a message: switch to a named game, follow up on the current game, or
 * a general Meepletron question. On "switch" it also resolves the game name into
 * candidate cards the client can auto-open (one match) or offer to pick (several).
 */
export const route = action({
  args: { text: v.string(), currentGameId: v.optional(v.id("games")) },
  handler: async (ctx, { text, currentGameId }): Promise<RouteResult> => {
    let currentTitle: string | null = null;
    if (currentGameId) {
      const g = await ctx.runQuery(api.games.getById, { gameId: currentGameId });
      currentTitle = g?.title ?? null;
    }

    let mode: RouteResult["mode"] = currentGameId ? "current" : "general";
    let gameName: string | undefined;
    try {
      const { object } = await generateObject({
        model: CHAT_MODEL,
        schema: z.object({
          mode: z.enum(["switch", "current", "general"]),
          gameName: z.string().optional(),
        }),
        prompt: buildRouterPrompt(currentTitle, text),
        temperature: 0,
        providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      });
      mode = object.mode;
      gameName = object.gameName?.trim() || undefined;
    } catch {
      // Model hiccup: with no current game, treat the message as a game name.
      if (!currentGameId) {
        mode = "switch";
        gameName = text;
      }
    }

    if (mode !== "switch") return { mode, candidates: [] };

    const term = (gameName ?? text).trim();
    return { mode: "switch", gameName: term, candidates: await resolveCandidates(ctx, term) };
  },
});

/**
 * Account for a general-mode answer's tokens (no chat/message to attach it to).
 * Mirrors the accounting half of chat.saveAssistantMessage.
 */
export const accountGeneralUsage = internalMutation({
  args: {
    userId: v.id("users"),
    usage: v.array(
      v.object({
        purpose: v.union(
          v.literal("chat-answer"),
          v.literal("chat-rerank"),
          v.literal("chat-rewrite"),
          v.literal("chat-embed"),
        ),
        model: v.string(),
        promptTokens: v.number(),
        completionTokens: v.number(),
        totalTokens: v.number(),
      }),
    ),
  },
  handler: async (ctx, { userId, usage }) => {
    let total = 0;
    for (const u of usage) {
      const totalTokens = finite(u.totalTokens);
      await ctx.db.insert("usageLog", {
        purpose: u.purpose,
        model: u.model,
        promptTokens: finite(u.promptTokens),
        completionTokens: finite(u.completionTokens),
        totalTokens,
      });
      total += totalTokens;
    }
    const user = await ctx.db.get("users", userId);
    if (user) {
      await ctx.db.patch("users", userId, {
        tokensUsedToday: finite(user.tokensUsedToday) + total,
      });
    }
  },
});
