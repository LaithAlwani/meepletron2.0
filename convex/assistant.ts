import { v } from "convex/values";
import { generateObject } from "ai";
import { z } from "zod";
import { action, internalMutation } from "./_generated/server";
import { CHAT_MODEL } from "./rag";
import { buildRouterPrompt } from "./lib/assistantPrompt";
import { finite } from "./lib/num";

/**
 * The global assistant's router + usage accounting. Streaming answers themselves
 * go through the `/assistant` (general) HTTP action; this file just classifies a
 * message. Resolving a named game into confirmable covers (and paginating "show
 * more") is done client-side against `games.assistantResolve`.
 */

type RouteResult = {
  mode: "switch" | "recommend" | "general";
  gameName?: string;
};

/**
 * Classify a message: name a specific game (`switch`, with `gameName`), ask for
 * a recommendation (`recommend`), or a general Meepletron question (`general`).
 */
export const route = action({
  args: { text: v.string(), currentGameId: v.optional(v.id("games")) },
  handler: async (ctx, { text }): Promise<RouteResult> => {
    let mode: RouteResult["mode"] = "general";
    let gameName: string | undefined;
    try {
      const { object } = await generateObject({
        model: CHAT_MODEL,
        schema: z.object({
          mode: z.enum(["switch", "recommend", "general"]),
          gameName: z.string().optional(),
        }),
        prompt: buildRouterPrompt(null, text),
        temperature: 0,
        providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      });
      mode = object.mode;
      gameName = object.gameName?.trim() || undefined;
    } catch {
      // Model hiccup: treat the message as a game name to look up.
      mode = "switch";
      gameName = text;
    }

    if (mode === "switch") return { mode, gameName: (gameName ?? text).trim() };
    return { mode };
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
