/**
 * Shared RAG retrieval + answer-prompt assembly. Used by the streaming `/chat`
 * HTTP action (convex/http.ts) and the offline FAQ generator (convex/faqs.ts),
 * so both retrieve, rerank, and ground answers identically. Callers decide how
 * to run the model (streamText vs generateText) from the returned `system`.
 */
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { google } from "@ai-sdk/google";
import { generateText, generateObject } from "ai";
import { z } from "zod";
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

export const CHAT_MODEL = google("gemini-2.5-flash");

export type UsageRow = {
  purpose: "chat-answer" | "chat-rerank" | "chat-rewrite" | "chat-embed";
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type Annotation = {
  n: number;
  gameId: Id<"games">;
  rulebookId: Id<"rulebooks">;
  bgTitle: string;
  breadcrumb?: string;
  page?: number;
  chunkType: string;
  scope: string;
  variantName?: string;
  text: string;
};

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
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
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
      // Reasoning on (bounded): choosing which passage actually answers the
      // question — e.g. the "take a researcher card" action vs. a card that
      // merely mentions "researcher card" — is exactly the judgement that a
      // little thinking gets right where keyword overlap alone misleads.
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 512 } } },
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

export type BuildAnswerResult = {
  system: string | null;
  annotations: Annotation[];
  usage: UsageRow[];
  empty: boolean;
  answerTemperature: number;
};

/**
 * Retrieve + rerank + assemble the grounded system prompt for one question.
 * `empty` = no relevant rulebook content survived (caller shows a static reply).
 */
export async function buildAnswer(
  ctx: ActionCtx,
  {
    rulebookIds,
    query,
    history,
    sourceTitles,
  }: {
    rulebookIds: Id<"rulebooks">[];
    query: string;
    history: { role: "user" | "assistant"; content: string }[];
    sourceTitles: string[];
  },
): Promise<BuildAnswerResult> {
  const usage: UsageRow[] = [];
  const config = await ctx.runQuery(internal.chat.getActiveConfig, {});

  const answerTemperature = config.answerTemperature;

  // 1. Expand + embed the question.
  const searchQuery = await rewriteQuery(query, history, usage);
  const { embedding, tokens: embedTokens } = await embedQuery(searchQuery);
  usage.push({
    purpose: "chat-embed",
    model: EMBEDDING_MODEL_ID,
    promptTokens: finite(embedTokens),
    completionTokens: 0,
    totalTokens: finite(embedTokens),
  });

  // 2. Vector search scoped to the selected rulebooks.
  const hits = await ctx.vectorSearch("chunks", "by_embedding", {
    vector: embedding,
    limit: config.v2TopK,
    filter: (q) => {
      const exprs = rulebookIds.map((id) => q.eq("rulebookId", id));
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

  // 4. Rerank down to N (or fall back to top-by-score).
  const ranked = await rerankChunks(
    searchQuery,
    candidates.slice(0, config.rerankCandidates),
    config.rerankTopN,
    usage,
  );

  if (ranked.length === 0) {
    return {
      system: null,
      annotations: [],
      usage,
      empty: true,
      answerTemperature,
    };
  }

  // 5. Include the iconography legend when tokens are in play.
  const legend = needsIconLegend(query, ranked)
    ? await ctx.runQuery(internal.chat.getLegendChunks, { rulebookIds })
    : [];

  const annotations: Annotation[] = ranked.map((c, i) => ({
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
  return { system, annotations, usage, empty: false, answerTemperature };
}
