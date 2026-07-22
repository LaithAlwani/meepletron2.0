import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { google } from "@ai-sdk/google";
import { streamText, generateObject, generateText } from "ai";
import { z } from "zod";
import { auth } from "./auth";
import { embedQuery, EMBEDDING_MODEL_ID } from "./lib/embedding";
import { finite } from "./lib/num";
import {
  buildRerankPrompt,
  buildRewritePrompt,
  buildSystemPrompt,
  formatContext,
  needsIconLegend,
  type RetrievedChunk,
} from "./lib/prompts";

const http = httpRouter();

// Convex Auth routes (/api/auth/*).
auth.addHttpRoutes(http);

const CHAT_MODEL = google("gemini-2.5-flash");

type UsageRow = {
  purpose: "chat-answer" | "chat-rerank" | "chat-rewrite" | "chat-embed";
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  };
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Stream a fixed message (and persist it) when there's nothing to retrieve. */
function staticAnswer(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  origin: string | null,
  text: string,
  save: () => Promise<unknown>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(text));
      // Persist BEFORE closing so the reactive query has the saved message by
      // the time the client sees the stream end (otherwise it flashes and
      // disappears, or never appears at all).
      await save();
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders(origin) },
  });
}

const chat = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");

  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return new Response("Unauthorized", {
      status: 401,
      headers: corsHeaders(origin),
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400, headers: corsHeaders(origin) });
  }
  const rawChatId = (body as { chatId?: unknown })?.chatId;
  if (typeof rawChatId !== "string") {
    return new Response("Missing chatId", { status: 400, headers: corsHeaders(origin) });
  }
  const chatId = rawChatId as Id<"chats">;

  const { selectedRulebookIds, hasIngested, query, history, sourceTitles } =
    await ctx.runQuery(internal.chat.getStreamContext, { chatId, userId });

  if (!query) {
    return new Response("No question found", {
      status: 400,
      headers: corsHeaders(origin),
    });
  }

  // No resource to answer from → reply with a prompt, and NEVER call the model
  // (so it costs no tokens and doesn't count against the daily budget).
  if (selectedRulebookIds.length === 0) {
    const text = hasIngested
      ? "You haven't selected a resource to chat with. Open Resources and choose at least one rulebook, then ask your question again."
      : "There's no ingested rulebook selected for this game yet, so I can't answer from a source. An admin needs to upload and ingest a rulebook first.";
    return staticAnswer(ctx, origin, text, () =>
      ctx.runMutation(internal.chat.saveAssistantMessage, {
        chatId,
        userId,
        content: text,
        annotations: [],
        usage: [],
      }),
    );
  }

  // Daily budget — reset window / reject if over. Reserved only now that we're
  // committed to actually generating an answer.
  try {
    await ctx.runMutation(internal.chat.reserveBudget, {
      userId,
      todayStartMs: startOfUtcDay(Date.now()),
    });
  } catch {
    return new Response(
      "You've reached today's message limit. Please try again tomorrow.",
      { status: 429, headers: corsHeaders(origin) },
    );
  }

  const usage: UsageRow[] = [];
  const config = await ctx.runQuery(internal.chat.getActiveConfig, {});

  // 1. Expand the question into rulebook vocabulary so retrieval matches even
  //    when the player uses casual/general words, then embed the expansion.
  const searchQuery = await rewriteQuery(query, history, usage);
  const { embedding, tokens: embedTokens } = await embedQuery(searchQuery);
  usage.push({
    purpose: "chat-embed",
    model: EMBEDDING_MODEL_ID,
    promptTokens: finite(embedTokens),
    completionTokens: 0,
    totalTokens: finite(embedTokens),
  });

  // 2. Vector search, scoped to the selected rulebooks.
  const hits = await ctx.vectorSearch("chunks", "by_embedding", {
    vector: embedding,
    limit: config.v2TopK,
    filter: (q) => {
      const exprs = selectedRulebookIds.map((id) => q.eq("rulebookId", id));
      return exprs.length === 1 ? exprs[0] : q.or(...exprs);
    },
  });
  const scoreById = new Map(hits.map((h) => [h._id, h._score]));

  // 3. Hydrate, drop legend hits, apply score threshold.
  const hydrated = await ctx.runQuery(internal.chat.hydrateChunks, {
    chunkIds: hits.map((h) => h._id),
  });
  const candidates = hydrated
    .filter((c) => c.chunkType !== "legend")
    .filter((c) => (scoreById.get(c.chunkId) ?? 0) >= config.v2ScoreThreshold);

  // 4. Rerank down to N (Gemini) or fall back to top-by-score.
  const ranked = await rerankChunks(query, candidates, config.rerankTopN, usage);

  // No relevant rulebook content → tell the user, and NEVER let the model
  // answer from its own knowledge.
  if (ranked.length === 0) {
    const text =
      "I couldn't find anything about that in the loaded rulebook(s). I only answer from the rulebook, so try rephrasing your question — or it may not be covered here.";
    return staticAnswer(ctx, origin, text, () =>
      ctx.runMutation(internal.chat.saveAssistantMessage, {
        chatId,
        userId,
        content: text,
        annotations: [],
        usage,
      }),
    );
  }

  // 5. Always include the iconography legend when tokens are in play.
  const legend = needsIconLegend(query, ranked)
    ? await ctx.runQuery(internal.chat.getLegendChunks, { rulebookIds: selectedRulebookIds })
    : [];

  const annotations = ranked.map((c, i) => ({
    n: i + 1,
    gameId: c.gameId as Id<"games">,
    rulebookId: c.rulebookId as Id<"rulebooks">,
    bgTitle: c.bgTitle,
    breadcrumb: c.breadcrumb || undefined,
    page: c.page,
    chunkType: c.chunkType,
    scope: c.scope,
    variantName: c.variantName,
    text: c.text,
  }));

  const system = buildSystemPrompt(sourceTitles, formatContext(ranked, legend));

  // 6. Stream the grounded answer; persist on completion.
  const result = streamText({
    model: CHAT_MODEL,
    system,
    messages: history as { role: "user" | "assistant"; content: string }[],
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let full = "";
      try {
        for await (const delta of result.textStream) {
          full += delta;
          controller.enqueue(encoder.encode(delta));
        }
        const answerUsage = await result.usage;
        const inTok = finite(answerUsage.inputTokens);
        const outTok = finite(answerUsage.outputTokens);
        usage.push({
          purpose: "chat-answer",
          model: "gemini-2.5-flash",
          promptTokens: inTok,
          completionTokens: outTok,
          totalTokens: finite(answerUsage.totalTokens) || inTok + outTok,
        });
      } catch {
        if (!full) full = "Sorry — something went wrong generating the answer.";
      }
      // Persist BEFORE closing the stream so the reactive query has the saved
      // message by the time the client sees the stream end (no flicker).
      try {
        await ctx.runMutation(internal.chat.saveAssistantMessage, {
          chatId,
          userId,
          content: full,
          annotations,
          usage,
        });
      } catch {
        // Best-effort persistence; the streamed text already reached the client.
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders(origin) },
  });
});

/**
 * Rewrite a casual question into a keyword-rich rulebook-vocabulary query to
 * improve vector recall. Falls back to the original question on any failure so
 * retrieval always proceeds.
 */
async function rewriteQuery(
  query: string,
  history: { role: string; content: string }[],
  usage: UsageRow[],
): Promise<string> {
  try {
    const { text, usage: u } = await generateText({
      model: CHAT_MODEL,
      prompt: buildRewritePrompt(history, query),
      temperature: 0,
    });
    const rewritten = text.trim();
    const it = finite(u.inputTokens);
    const ot = finite(u.outputTokens);
    usage.push({
      purpose: "chat-rewrite",
      model: "gemini-2.5-flash",
      promptTokens: it,
      completionTokens: ot,
      totalTokens: finite(u.totalTokens) || it + ot,
    });
    // Blend in the original wording so exact-term questions still match well.
    return rewritten ? `${query} ${rewritten}` : query;
  } catch {
    return query;
  }
}

async function rerankChunks(
  query: string,
  chunks: (RetrievedChunk & { chunkId: Id<"chunks"> })[],
  n: number,
  usage: UsageRow[],
): Promise<(RetrievedChunk & { chunkId: Id<"chunks"> })[]> {
  if (chunks.length === 0) return [];
  if (chunks.length <= n) return chunks.slice(0, n);

  try {
    const { object, usage: rerankUsage } = await generateObject({
      model: CHAT_MODEL,
      schema: z.object({ indices: z.array(z.number()) }),
      prompt: buildRerankPrompt(query, chunks, n),
      temperature: 0,
    });
    const rInTok = finite(rerankUsage.inputTokens);
    const rOutTok = finite(rerankUsage.outputTokens);
    usage.push({
      purpose: "chat-rerank",
      model: "gemini-2.5-flash",
      promptTokens: rInTok,
      completionTokens: rOutTok,
      totalTokens: finite(rerankUsage.totalTokens) || rInTok + rOutTok,
    });
    const seen = new Set<number>();
    const selected: (RetrievedChunk & { chunkId: Id<"chunks"> })[] = [];
    for (const i of object.indices) {
      if (!Number.isInteger(i) || i < 1 || i > chunks.length || seen.has(i)) continue;
      seen.add(i);
      selected.push(chunks[i - 1]);
      if (selected.length >= n) break;
    }
    return selected.length > 0 ? selected : chunks.slice(0, n);
  } catch {
    return chunks.slice(0, n);
  }
}

http.route({ path: "/chat", method: "POST", handler: chat });
http.route({
  path: "/chat",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request.headers.get("Origin")),
    });
  }),
});

export default http;
