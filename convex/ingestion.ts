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
  const { text, usage } = await generateText({
    model: google("gemini-2.5-flash"),
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

    if (state.nextBatchIndex >= state.batchPlan.length) {
      await ctx.scheduler.runAfter(0, internal.ingestion.finalizeParse, {
        draftId,
      });
      return;
    }

    const batch = state.batchPlan[state.nextBatchIndex];
    try {
      const blob = await ctx.storage.get(state.storageId);
      if (!blob) throw new Error("Rulebook file is missing");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const slice = await extractPageRange(
        bytes,
        batch.startPage,
        batch.endPage,
      );

      const { markdown, usage } = await extractMarkdown(
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

      await ctx.runMutation(internal.ingestionDb.saveBatch, {
        draftId,
        index: batch.index,
        startPage: batch.startPage,
        endPage: batch.endPage,
        markdown: cleaned,
        newIconTokens: extractIconTokens(cleaned),
        newSectionHeadings: extractSectionHeadings(cleaned),
        usage,
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
    const markdowns = await ctx.runQuery(
      internal.ingestionDb.getBatchesMarkdown,
      { draftId },
    );
    const stitched = markdowns.join("\n\n");
    const chunks = chunkMarkdown(stitched);

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
