import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

/**
 * Citation snapshot stored alongside an answer — shared by `messages` (chat)
 * and `gameFaqs` (cached FAQ). Mirrors the shape produced by `rag.buildAnswer`.
 *
 * `chunkId` (newer rows) points at the source chunk. Chat messages then store
 * only a short `text` snippet and the UI fetches the full passage on open
 * (chat.citationText); rows without `chunkId` carry the full text inline.
 */
export const annotationValidator = v.object({
  n: v.number(),
  gameId: v.id("games"),
  rulebookId: v.id("rulebooks"),
  bgTitle: v.string(),
  breadcrumb: v.optional(v.string()),
  page: v.optional(v.number()),
  chunkType: v.string(),
  scope: v.string(),
  variantName: v.optional(v.string()),
  text: v.string(),
  chunkId: v.optional(v.id("chunks")),
});

/** Stored snippet length for chat citations (full text is fetched on open). */
export const CITATION_SNIPPET_CHARS = 300;

/**
 * Slim a citation for storage on a chat message: keep the metadata, cut `text`
 * to a snippet. Only when `chunkId` is known (so the full text is fetchable).
 */
export function slimAnnotation<
  T extends { text: string; chunkId?: Id<"chunks"> },
>(a: T): T {
  if (!a.chunkId || a.text.length <= CITATION_SNIPPET_CHARS) return a;
  return { ...a, text: `${a.text.slice(0, CITATION_SNIPPET_CHARS).trimEnd()}…` };
}
