import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { r2, deleteMedia } from "./r2";
import { rulebookKey } from "./lib/r2keys";

/**
 * Admin: mint an R2 upload URL for a rulebook/download file, foldered under the
 * game's slug. The client PUTs the file to `url`, then calls `addRulebook` with
 * the returned `key`.
 */
export const generateRulebookUploadUrl = mutation({
  args: { gameId: v.id("games"), filename: v.string() },
  handler: async (ctx, { gameId, filename }) => {
    await requireAdmin(ctx);
    const game = await ctx.db.get("games", gameId);
    if (!game) throw new Error("Game not found");
    const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
    return await r2.generateUploadUrl(rulebookKey(game.slug, safeName));
  },
});

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
    storageKey: v.string(),
    kind: v.optional(v.union(v.literal("rulebook"), v.literal("download"))),
  },
  handler: async (ctx, { gameId, label, filename, storageKey, kind }) => {
    await requireAdmin(ctx);
    const fileKind = kind ?? "rulebook";
    // Content-type isn't reliably synced yet at attach time, so gate on the
    // filename extension (the ingest pipeline also fails loudly on non-PDFs).
    if (fileKind === "rulebook" && !/\.pdf$/i.test(filename)) {
      throw new Error("Rulebooks must be PDFs");
    }
    const game = await ctx.db.get("games", gameId);
    if (!game) throw new Error("Game not found");

    return await ctx.db.insert("rulebooks", {
      gameId,
      label: label.trim() || (fileKind === "download" ? "Download" : "Rulebook"),
      filename,
      storageKey,
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

    await deleteMedia(ctx, rb.storageKey, rb.storageId);
    await ctx.db.delete("rulebooks", rulebookId);
  },
});
