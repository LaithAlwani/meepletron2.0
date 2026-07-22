import { google } from "@ai-sdk/google";
import { embed, embedMany } from "ai";

/**
 * Single source of truth for embeddings. The dimensions here MUST match the
 * `chunks.by_embedding` vector index in schema.ts. Changing the model or
 * dimension means dropping the index and re-embedding every chunk.
 */
export const EMBEDDING_MODEL_ID = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

const model = google.textEmbedding(EMBEDDING_MODEL_ID);

function providerOptions(taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT") {
  return { google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType } };
}

/** Embed a search query (use for retrieval). */
export async function embedQuery(
  value: string,
): Promise<{ embedding: number[]; tokens: number }> {
  const { embedding, usage } = await embed({
    model,
    value,
    providerOptions: providerOptions("RETRIEVAL_QUERY"),
  });
  return { embedding, tokens: usage?.tokens ?? 0 };
}

/** Embed a batch of documents/chunks (use at ingestion time). */
export async function embedDocuments(
  values: string[],
): Promise<{ embeddings: number[][]; tokens: number }> {
  const { embeddings, usage } = await embedMany({
    model,
    values,
    providerOptions: providerOptions("RETRIEVAL_DOCUMENT"),
  });
  return { embeddings, tokens: usage?.tokens ?? 0 };
}
