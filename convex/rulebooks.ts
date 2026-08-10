import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { recomputeChatReady } from "./lib/chatReady";

/**
 * Admin: attach an uploaded file to a game.
 * - kind "rulebook": must be a PDF (it gets ingested + used in chat).
 * - kind "download": any file (scoring sheet, diagram, …) — download-only.
 */
export const addRulebook = mutation({
  args: {
    gameId: v.id("games"),
    label: v.string(),
    filename: v.string(),
    storageId: v.id("_storage"),
    kind: v.optional(v.union(v.literal("rulebook"), v.literal("download"))),
  },
  handler: async (ctx, { gameId, label, filename, storageId, kind }) => {
    await requireAdmin(ctx);
    const fileKind = kind ?? "rulebook";
    const meta = await ctx.db.system.get("_storage", storageId);
    if (!meta) throw new Error("File not found");
    if (fileKind === "rulebook" && meta.contentType !== "application/pdf") {
      throw new Error("Rulebooks must be PDFs");
    }
    const game = await ctx.db.get("games", gameId);
    if (!game) throw new Error("Game not found");

    return await ctx.db.insert("rulebooks", {
      gameId,
      label: label.trim() || (fileKind === "download" ? "Download" : "Rulebook"),
      filename,
      storageId,
      kind: fileKind,
      isIngested: false,
      ingestState: "none",
    });
  },
});

export const updateRulebookLabel = mutation({
  args: { rulebookId: v.id("rulebooks"), label: v.string() },
  handler: async (ctx, { rulebookId, label }) => {
    await requireAdmin(ctx);
    await ctx.db.patch("rulebooks", rulebookId, {
      label: label.trim() || "Rulebook",
    });
  },
});

/** Admin: delete a rulebook and everything derived from it. */
export const deleteRulebook = mutation({
  args: { rulebookId: v.id("rulebooks") },
  handler: async (ctx, { rulebookId }) => {
    await requireAdmin(ctx);
    const rb = await ctx.db.get("rulebooks", rulebookId);
    if (!rb) return;

    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_rulebook", (q) => q.eq("rulebookId", rulebookId))
      .take(2000);
    for (const c of chunks) await ctx.db.delete("chunks", c._id);

    const drafts = await ctx.db
      .query("migrationDrafts")
      .withIndex("by_rulebook", (q) => q.eq("rulebookId", rulebookId))
      .take(20);
    for (const draft of drafts) {
      const batches = await ctx.db
        .query("draftBatches")
        .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
        .take(500);
      for (const b of batches) await ctx.db.delete("draftBatches", b._id);
      const draftChunks = await ctx.db
        .query("draftChunks")
        .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
        .take(2000);
      for (const dc of draftChunks) await ctx.db.delete("draftChunks", dc._id);
      await ctx.db.delete("migrationDrafts", draft._id);
    }

    await ctx.storage.delete(rb.storageId);
    await ctx.db.delete("rulebooks", rulebookId);

    // The family may no longer be chat-ready without this rulebook.
    await recomputeChatReady(ctx, rb.gameId);
  },
});
