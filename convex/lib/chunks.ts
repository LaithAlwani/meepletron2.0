/**
 * Chunk storage helpers for the embeddings split: each chunk's ~6 KB vector
 * lives in its own `chunkEmbeddings` row (vector index `by_embedding`) and the
 * `chunks` doc keeps only text + `embeddingId`, so RAG hydration reads
 * text-sized docs. Every chunk insert / delete goes through here so the two
 * tables never drift.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../_generated/server";

export type ChunkFields = Omit<
  Doc<"chunks">,
  "_id" | "_creationTime" | "embedding" | "embeddingId"
>;

/**
 * Insert one chunk + its embedding row.
 */
export async function insertChunk(
  ctx: MutationCtx,
  fields: ChunkFields,
  embedding: number[],
): Promise<Id<"chunks">> {
  const chunkId = await ctx.db.insert("chunks", fields);
  const embeddingId = await ctx.db.insert("chunkEmbeddings", {
    chunkId,
    rulebookId: fields.rulebookId,
    chunkType: fields.chunkType,
    embedding,
  });
  await ctx.db.patch("chunks", chunkId, { embeddingId });
  return chunkId;
}

/** Delete a chunk and its embedding row. */
export async function deleteChunk(
  ctx: MutationCtx,
  chunk: Doc<"chunks">,
): Promise<void> {
  if (chunk.embeddingId) {
    const e = await ctx.db.get("chunkEmbeddings", chunk.embeddingId);
    if (e) await ctx.db.delete("chunkEmbeddings", e._id);
  }
  await ctx.db.delete("chunks", chunk._id);
}

/** Chunks deleted per transaction (each costs a chunk + a ~6 KB embedding read). */
export const CHUNK_DELETE_BATCH = 200;

/**
 * Delete up to `limit` of a rulebook's chunks (+ embeddings). Returns true when
 * more may remain — the caller finishes via `chunkMigration.purgeRulebookChunks`
 * (self-rescheduling) or by calling again in a fresh transaction.
 */
export async function deleteRulebookChunks(
  ctx: MutationCtx,
  rulebookId: Id<"rulebooks">,
  limit: number = CHUNK_DELETE_BATCH,
): Promise<boolean> {
  const batch = await ctx.db
    .query("chunks")
    .withIndex("by_rulebook", (q) => q.eq("rulebookId", rulebookId))
    .take(limit);
  for (const c of batch) await deleteChunk(ctx, c);
  return batch.length === limit;
}

/** A vector hit id. */
export type ChunkHitId = Id<"chunkEmbeddings">;

/**
 * Vector-search chunks scoped to `rulebookIds` (non-empty). Hits are
 * `chunkEmbeddings` ids; pass them to `internal.chat.hydrateChunks`.
 */
export async function searchChunkVectors(
  ctx: ActionCtx,
  {
    vector,
    limit,
    rulebookIds,
  }: {
    vector: number[];
    limit: number;
    rulebookIds: Id<"rulebooks">[];
  },
): Promise<{ _id: ChunkHitId; _score: number }[]> {
  return await ctx.vectorSearch("chunkEmbeddings", "by_embedding", {
    vector,
    limit,
    filter: (q) => {
      const e = rulebookIds.map((id) => q.eq("rulebookId", id));
      return e.length === 1 ? e[0] : q.or(...e);
    },
  });
}
