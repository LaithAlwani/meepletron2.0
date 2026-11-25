/**
 * Background chunk cleanup. A rulebook can have more chunks than one
 * transaction should delete, so deletion finishes here in batches (each chunk
 * also drops its `chunkEmbeddings` row — see lib/chunks.ts).
 */
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { deleteRulebookChunks } from "./lib/chunks";

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
