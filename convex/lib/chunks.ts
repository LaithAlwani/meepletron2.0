/**
 * Chunk storage helpers for the embeddings split: each chunk's ~6 KB vector
 * lives in its own `chunkEmbeddings` row (vector index `by_embedding`) and the
 * `chunks` doc keeps only text + `embeddingId`, so RAG hydration reads
 * text-sized docs. Every chunk insert / delete goes through here so the two
 * tables never drift. Migration + flag: convex/chunkMigration.ts.
 */
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

/** migrationFlags key: set once every chunk has a `chunkEmbeddings` row. */
export const EMBEDDINGS_COPIED_FLAG = "chunkEmbeddingsCopied";

/**
 * True once `chunkMigration.copyEmbeddings` has finished. Before then, RAG
 * still searches the legacy `chunks.by_embedding` index and writers keep the
 * inline copy so new chunks stay findable on that path.
 */
export async function embeddingsCopied(ctx: QueryCtx): Promise<boolean> {
  const row = await ctx.db
    .query("migrationFlags")
    .withIndex("by_key", (q) => q.eq("key", EMBEDDINGS_COPIED_FLAG))
    .unique();
  return row?.done === true;
}

export type ChunkFields = Omit<
  Doc<"chunks">,
  "_id" | "_creationTime" | "embedding" | "embeddingId"
>;

/**
 * Insert one chunk + its embedding row. `legacyCopy` also writes the vector
 * inline on the chunk (needed only until the copy migration flips the flag —
 * pass `!(await embeddingsCopied(ctx))`, read once per mutation).
 */
export async function insertChunk(
  ctx: MutationCtx,
  fields: ChunkFields,
  embedding: number[],
  legacyCopy: boolean,
): Promise<Id<"chunks">> {
  const chunkId = await ctx.db.insert(
    "chunks",
    legacyCopy ? { ...fields, embedding } : fields,
  );
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

/** A vector hit: a `chunks` id (legacy index) or a `chunkEmbeddings` id. */
export type ChunkHitId = Id<"chunks"> | Id<"chunkEmbeddings">;

/**
 * Vector-search chunks scoped to `rulebookIds` (non-empty), on whichever index
 * the migration flag selects. Hits go straight to `internal.chat.hydrateChunks`
 * (accepts either id kind). `useEmbeddingTable` skips the flag read when the
 * caller already has it (buildAnswer reads it via getActiveConfig).
 */
export async function searchChunkVectors(
  ctx: ActionCtx,
  {
    vector,
    limit,
    rulebookIds,
    useEmbeddingTable,
  }: {
    vector: number[];
    limit: number;
    rulebookIds: Id<"rulebooks">[];
    useEmbeddingTable?: boolean;
  },
): Promise<{ _id: ChunkHitId; _score: number }[]> {
  const useNew =
    useEmbeddingTable ??
    (await ctx.runQuery(internal.chunkMigration.embeddingsReady, {}));
  if (useNew) {
    return await ctx.vectorSearch("chunkEmbeddings", "by_embedding", {
      vector,
      limit,
      filter: (q) => {
        const e = rulebookIds.map((id) => q.eq("rulebookId", id));
        return e.length === 1 ? e[0] : q.or(...e);
      },
    });
  }
  return await ctx.vectorSearch("chunks", "by_embedding", {
    vector,
    limit,
    filter: (q) => {
      const e = rulebookIds.map((id) => q.eq("rulebookId", id));
      return e.length === 1 ? e[0] : q.or(...e);
    },
  });
}
