/**
 * Embeddings split migration (chunks.embedding → chunkEmbeddings). Staged:
 *
 *   1. copyEmbeddings     — for every chunk with an inline embedding and no
 *                           `embeddingId`, insert its chunkEmbeddings row. Flips
 *                           the `chunkEmbeddingsCopied` flag when done, which
 *                           switches RAG retrieval + stops new inline copies.
 *   2. stripChunkEmbeddings — after verifying, drop the inline vectors so chunk
 *                           docs are text-only. Requires the flag.
 *   3. (cleanup deploy)   — remove `chunks.embedding` + `chunks.by_embedding`.
 *
 * All run as self-rescheduling internal mutations, one page per transaction.
 */
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  EMBEDDINGS_COPIED_FLAG,
  deleteRulebookChunks,
  embeddingsCopied,
} from "./lib/chunks";

// ~100 chunks/txn: each page reads ~100 × 6–8 KB and writes a 6 KB embedding
// row + a chunk patch per chunk (~1.5 MB) — well under the per-transaction
// read/write byte limits.
const PAGE = 100;

/** Whether retrieval should use the chunkEmbeddings index. */
export const embeddingsReady = internalQuery({
  args: {},
  handler: async (ctx): Promise<boolean> => embeddingsCopied(ctx),
});

async function writeFlag(ctx: MutationCtx, done: boolean) {
  const row = await ctx.db
    .query("migrationFlags")
    .withIndex("by_key", (q) => q.eq("key", EMBEDDINGS_COPIED_FLAG))
    .unique();
  if (row) {
    await ctx.db.patch("migrationFlags", row._id, { done, updatedAt: Date.now() });
  } else {
    await ctx.db.insert("migrationFlags", {
      key: EMBEDDINGS_COPIED_FLAG,
      done,
      updatedAt: Date.now(),
    });
  }
}

/** Set/clear the flag directly (rollback: `{ done: false }` — only BEFORE the
 *  strip, since the legacy index is empty afterwards). */
export const setEmbeddingsFlag = internalMutation({
  args: { done: v.boolean() },
  handler: async (ctx, { done }) => writeFlag(ctx, done),
});

/** Stage 1: copy inline embeddings into chunkEmbeddings, then flip the flag. */
export const copyEmbeddings = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const res = await ctx.db
      .query("chunks")
      .paginate({ numItems: PAGE, cursor: cursor ?? null });
    let copied = 0;
    let missing = 0;
    for (const c of res.page) {
      if (c.embeddingId) continue;
      if (!c.embedding) {
        missing++;
        continue;
      }
      const embeddingId = await ctx.db.insert("chunkEmbeddings", {
        chunkId: c._id,
        rulebookId: c.rulebookId,
        chunkType: c.chunkType,
        embedding: c.embedding,
      });
      await ctx.db.patch("chunks", c._id, { embeddingId });
      copied++;
    }
    console.log(
      `[copyEmbeddings] page=${res.page.length} copied=${copied} missingEmbedding=${missing} done=${res.isDone}`,
    );
    if (!res.isDone) {
      await ctx.scheduler.runAfter(0, internal.chunkMigration.copyEmbeddings, {
        cursor: res.continueCursor,
      });
    } else {
      await writeFlag(ctx, true);
      console.log("[copyEmbeddings] complete — retrieval now uses chunkEmbeddings");
    }
  },
});

/**
 * Read-only audit, one page per call (pass `continueCursor` back in): counts
 * chunks still carrying an inline vector, linked to an embedding row, or with
 * neither (unsearchable — should be 0).
 */
export const auditBatch = internalQuery({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const res = await ctx.db
      .query("chunks")
      .paginate({ numItems: 500, cursor: cursor ?? null });
    let inlineEmbedding = 0;
    let linked = 0;
    let neither = 0;
    for (const c of res.page) {
      if (c.embedding) inlineEmbedding++;
      if (c.embeddingId) linked++;
      if (!c.embedding && !c.embeddingId) neither++;
    }
    return {
      scanned: res.page.length,
      inlineEmbedding,
      linked,
      neither,
      isDone: res.isDone,
      continueCursor: res.continueCursor,
    };
  },
});

/** Stage 2: drop inline vectors from chunks (requires the copy to be done). */
export const stripChunkEmbeddings = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    if (!(await embeddingsCopied(ctx))) {
      throw new Error("Run chunkMigration.copyEmbeddings to completion first");
    }
    const res = await ctx.db
      .query("chunks")
      .paginate({ numItems: PAGE, cursor: cursor ?? null });
    let stripped = 0;
    for (const c of res.page) {
      if (!c.embedding) continue;
      // Safety net: never drop the only copy of a vector.
      if (!c.embeddingId) {
        const embeddingId = await ctx.db.insert("chunkEmbeddings", {
          chunkId: c._id,
          rulebookId: c.rulebookId,
          chunkType: c.chunkType,
          embedding: c.embedding,
        });
        await ctx.db.patch("chunks", c._id, { embeddingId, embedding: undefined });
      } else {
        await ctx.db.patch("chunks", c._id, { embedding: undefined });
      }
      stripped++;
    }
    console.log(
      `[stripChunkEmbeddings] page=${res.page.length} stripped=${stripped} done=${res.isDone}`,
    );
    if (!res.isDone) {
      await ctx.scheduler.runAfter(0, internal.chunkMigration.stripChunkEmbeddings, {
        cursor: res.continueCursor,
      });
    }
  },
});

/** Delete all of a rulebook's chunks (+ embeddings), one batch per transaction. */
export const purgeRulebookChunks = internalMutation({
  args: { rulebookId: v.id("rulebooks") },
  handler: async (ctx, { rulebookId }) => {
    if (await deleteRulebookChunks(ctx, rulebookId)) {
      await ctx.scheduler.runAfter(0, internal.chunkMigration.purgeRulebookChunks, {
        rulebookId,
      });
    }
  },
});
