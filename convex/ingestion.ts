"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getPdfPageCount, planBatches, extractPageRange } from "./lib/pdf";
import {
  buildExtractionPrompt,
  postProcessMarkdown,
  extractIconTokens,
  extractSectionHeadings,
  splitByPageMarker,
  joinPages,
} from "./lib/extraction";
import { chunkMarkdown } from "./lib/chunker";
import { embedDocuments } from "./lib/embedding";

const CHUNK_INSERT_BATCH = 100;
const EMBED_COMMIT_BATCH = 50;

async function extractMarkdown(
  bytes: Uint8Array,
  startPage: number,
  endPage: number,
  knownIcons: string[],
  knownSections: string[],
) {
  const { text, usage, finishReason } = await generateText({
    model: google("gemini-2.5-flash"),
    // Faithful transcription of dense/multi-column rulebook pages benefits from
    // Gemini's "thinking" — leave it on (dynamic budget) for quality. Give a
    // generous output cap so a page-heavy batch isn't silently truncated.
    providerOptions: { google: { thinkingConfig: { thinkingBudget: -1 } } },
    maxOutputTokens: 32768,
    messages: [
      {
        role: "user",
        content: [
          { type: "file", data: bytes, mediaType: "application/pdf" },
          {
            type: "text",
            text: buildExtractionPrompt(
              startPage,
              endPage,
              knownIcons,
              knownSections,
            ),
          },
        ],
      },
    ],
  });
  return {
    markdown: text,
    finishReason,
    usage: {
      promptTokens: usage.inputTokens ?? 0,
      completionTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    },
  };
}

/** Admin: kick off ingestion for a rulebook. The scheduler drives the rest. */
export const startIngestion = action({
  args: { rulebookId: v.id("rulebooks") },
  handler: async (
    ctx,
    { rulebookId },
  ): Promise<{ totalPages: number; totalBatches: number }> => {
    await ctx.runQuery(internal.users.ensureAdmin, {});
    const info = await ctx.runQuery(
      internal.ingestionDb.getRulebookForIngest,
      { rulebookId },
    );
    if (!info) throw new Error("Rulebook not found");
    if (info.kind === "download") {
      throw new Error("Download-only files can't be ingested");
    }

    const blob = await ctx.storage.get(info.storageId);
    if (!blob) throw new Error("Rulebook file is missing");
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const totalPages = await getPdfPageCount(bytes);
    const batchPlan = planBatches(totalPages);

    const draftId = await ctx.runMutation(internal.ingestionDb.createDraft, {
      rulebookId,
      gameId: info.gameId,
      gameTitle: info.gameTitle,
      totalPages,
      batchPlan,
    });

    await ctx.scheduler.runAfter(0, internal.ingestion.processBatch, {
      draftId,
    });
    return { totalPages, totalBatches: batchPlan.length };
  },
});

/** Process exactly one page-range batch, then reschedule itself. */
export const processBatch = internalAction({
  args: { draftId: v.id("migrationDrafts") },
  handler: async (ctx, { draftId }): Promise<void> => {
    const state = await ctx.runQuery(internal.ingestionDb.getDraftForBatch, {
      draftId,
    });
    if (!state) return;

    // Halt the loop if the user paused or stopped it — progress is preserved,
    // and resuming reschedules from the current batch index.
    if (state.control === "paused" || state.control === "stopped") return;

    if (state.nextBatchIndex >= state.batchPlan.length) {
      await ctx.scheduler.runAfter(0, internal.ingestion.finalizeParse, {
        draftId,
      });
      return;
    }

    const batch = state.batchPlan[state.nextBatchIndex];
    // Arm a watchdog: if this batch is killed mid-run (OOM/timeout) the catch
    // below never fires, so schedule a check that surfaces the stall as an error
    // instead of hanging silently. No-op once the batch advances the index.
    // Generous window — thinking + per-page recovery can make a batch slower.
    await ctx.scheduler.runAfter(
      10 * 60 * 1000,
      internal.ingestionDb.markStalledIfNoProgress,
      { draftId, expectedIndex: state.nextBatchIndex },
    );
    try {
      const blob = await ctx.storage.get(state.storageId);
      if (!blob) throw new Error("Rulebook file is missing");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const slice = await extractPageRange(
        bytes,
        batch.startPage,
        batch.endPage,
      );

      const { markdown, usage, finishReason } = await extractMarkdown(
        slice,
        batch.startPage,
        batch.endPage,
        state.iconTokens,
        state.sectionHeadings,
      );
      const cleaned = postProcessMarkdown(
        markdown,
        batch.startPage,
        batch.endPage,
      );

      // Coverage check: every page in the range should produce content. Pages
      // with no marker (dropped/merged) — or all pages if the batch response was
      // truncated — are re-extracted one page at a time (bulletproof page id)
      // and spliced back in page order.
      const pages = splitByPageMarker(cleaned, batch.startPage);
      const truncated = finishReason === "length";
      const totalUsage = { ...usage };
      for (let p = batch.startPage; p <= batch.endPage; p++) {
        const have = pages.get(p)?.trim();
        if (!truncated && have) continue;
        const pageSlice = await extractPageRange(bytes, p, p);
        const r = await extractMarkdown(
          pageSlice,
          p,
          p,
          state.iconTokens,
          state.sectionHeadings,
        );
        totalUsage.promptTokens += r.usage.promptTokens;
        totalUsage.completionTokens += r.usage.completionTokens;
        totalUsage.totalTokens += r.usage.totalTokens;
        const pageMd = postProcessMarkdown(r.markdown, p, p);
        for (const [pg, c] of splitByPageMarker(pageMd, p)) {
          if (c.trim()) pages.set(pg, c);
        }
      }
      const merged = joinPages(pages);

      await ctx.runMutation(internal.ingestionDb.saveBatch, {
        draftId,
        index: batch.index,
        startPage: batch.startPage,
        endPage: batch.endPage,
        markdown: merged,
        newIconTokens: extractIconTokens(merged),
        newSectionHeadings: extractSectionHeadings(merged),
        usage: totalUsage,
      });

      await ctx.scheduler.runAfter(0, internal.ingestion.processBatch, {
        draftId,
      });
    } catch (e) {
      await ctx.runMutation(internal.ingestionDb.setDraftError, {
        draftId,
        error:
          e instanceof Error ? e.message : "Failed to parse this page range",
      });
    }
  },
});

/** Stitch batch Markdown, chunk it, and write reviewable draft chunks. */
export const finalizeParse = internalAction({
  args: { draftId: v.id("migrationDrafts") },
  handler: async (ctx, { draftId }): Promise<void> => {
    const { markdowns, gameTitle } = await ctx.runQuery(
      internal.ingestionDb.getBatchesMarkdown,
      { draftId },
    );
    const stitched = markdowns.join("\n\n");
    const chunks = chunkMarkdown(stitched, gameTitle);

    for (let i = 0; i < chunks.length; i += CHUNK_INSERT_BATCH) {
      await ctx.runMutation(internal.ingestionDb.saveDraftChunks, {
        draftId,
        chunks: chunks.slice(i, i + CHUNK_INSERT_BATCH),
        startOrder: i,
      });
    }
    await ctx.runMutation(internal.ingestionDb.finishParse, { draftId });
  },
});

/** Admin: embed the accepted draft chunks and commit them as searchable chunks. */
export const commitIngestion = action({
  args: { rulebookId: v.id("rulebooks") },
  handler: async (
    ctx,
    { rulebookId },
  ): Promise<{ committed: number }> => {
    await ctx.runQuery(internal.users.ensureAdmin, {});
    const data = await ctx.runQuery(
      internal.ingestionDb.getAcceptedForCommit,
      { rulebookId },
    );
    if (!data || data.chunks.length === 0) {
      throw new Error("No accepted chunks to commit");
    }

    const { embeddings, tokens } = await embedDocuments(
      data.chunks.map((c) => c.text),
    );
    const withEmbeddings = data.chunks.map((c, i) => ({
      ...c,
      embedding: embeddings[i],
    }));

    await ctx.runMutation(internal.ingestionDb.clearRulebookChunks, {
      rulebookId,
    });
    for (let i = 0; i < withEmbeddings.length; i += EMBED_COMMIT_BATCH) {
      await ctx.runMutation(internal.ingestionDb.insertCommittedChunks, {
        rulebookId,
        gameId: data.gameId,
        chunks: withEmbeddings.slice(i, i + EMBED_COMMIT_BATCH),
      });
    }
    await ctx.runMutation(internal.ingestionDb.finalizeCommit, {
      rulebookId,
      draftId: data.draftId,
      embedTokens: tokens,
    });

    return { committed: withEmbeddings.length };
  },
});
