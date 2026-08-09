import { v } from "convex/values";

/**
 * Citation snapshot stored alongside an answer — shared by `messages` (chat)
 * and `gameFaqs` (cached FAQ). Mirrors the shape produced by `rag.buildAnswer`.
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
});
