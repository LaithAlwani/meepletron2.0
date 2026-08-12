import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAdmin } from "./lib/auth";
import { recomputeChatReady } from "./lib/chatReady";

const batchPlanValidator = v.array(
  v.object({
    index: v.number(),
    startPage: v.number(),
    endPage: v.number(),
  }),
);

const draftChunkInput = v.object({
  breadcrumb: v.string(),
  page: v.optional(v.number()),
  chunkType: v.string(),
  scope: v.string(),
  variantName: v.optional(v.string()),
  text: v.string(),
  flags: v.array(v.string()),
});

const usageValidator = v.object({
  promptTokens: v.number(),
  completionTokens: v.number(),
  totalTokens: v.number(),
});

// ---------------------------------------------------------------------------
// Internal — used by the ingestion actions
// ---------------------------------------------------------------------------

export const getRulebookForIngest = internalQuery({
  args: { rulebookId: v.id("rulebooks") },
  handler: async (ctx, { rulebookId }) => {
    const rb = await ctx.db.get("rulebooks", rulebookId);
    if (!rb) return null;
    const game = await ctx.db.get("games", rb.gameId);
    return {
      gameId: rb.gameId,
      gameTitle: game?.title ?? "Unknown game",
      storageId: rb.storageId,
      kind: rb.kind ?? ("rulebook" as const),
    };
  },
});

/** Clear any prior draft for this rulebook and start a fresh one. */
export const createDraft = internalMutation({
  args: {
    rulebookId: v.id("rulebooks"),
    gameId: v.id("games"),
    gameTitle: v.string(),
    totalPages: v.number(),
    batchPlan: batchPlanValidator,
  },
  handler: async (ctx, args): Promise<Id<"migrationDrafts">> => {
    const olds = await ctx.db
      .query("migrationDrafts")
      .withIndex("by_rulebook", (q) => q.eq("rulebookId", args.rulebookId))
      .take(20);
    for (const old of olds) {
      const batches = await ctx.db
        .query("draftBatches")
        .withIndex("by_draft", (q) => q.eq("draftId", old._id))
        .take(1000);
      for (const b of batches) await ctx.db.delete("draftBatches", b._id);
      const chunks = await ctx.db
        .query("draftChunks")
        .withIndex("by_draft", (q) => q.eq("draftId", old._id))
        .take(5000);
      for (const c of chunks) await ctx.db.delete("draftChunks", c._id);
      await ctx.db.delete("migrationDrafts", old._id);
    }

    await ctx.db.patch("rulebooks", args.rulebookId, { ingestState: "parsing" });

    return await ctx.db.insert("migrationDrafts", {
      rulebookId: args.rulebookId,
      gameId: args.gameId,
      gameTitle: args.gameTitle,
      status: "parsing",
      totalPages: args.totalPages,
      batchPlan: args.batchPlan,
      nextBatchIndex: 0,
      iconTokens: [],
      sectionHeadings: [],
    });
  },
});

export const getDraftForBatch = internalQuery({
  args: { draftId: v.id("migrationDrafts") },
  handler: async (ctx, { draftId }) => {
    const draft = await ctx.db.get("migrationDrafts", draftId);
    if (!draft) return null;
    const rb = await ctx.db.get("rulebooks", draft.rulebookId);
    if (!rb) return null;
    return {
      rulebookId: draft.rulebookId,
      storageId: rb.storageId,
      batchPlan: draft.batchPlan,
      nextBatchIndex: draft.nextBatchIndex,
      iconTokens: draft.iconTokens,
      sectionHeadings: draft.sectionHeadings,
      control: draft.control ?? "running",
    };
  },
});

export const saveBatch = internalMutation({
  args: {
    draftId: v.id("migrationDrafts"),
    index: v.number(),
    startPage: v.number(),
    endPage: v.number(),
    markdown: v.string(),
    newIconTokens: v.array(v.string()),
    newSectionHeadings: v.array(v.string()),
    usage: usageValidator,
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get("migrationDrafts", args.draftId);
    if (!draft) return;

    // Idempotent: replace any existing batch at this index (a pause/resume race
    // could otherwise duplicate a page range).
    const existing = await ctx.db
      .query("draftBatches")
      .withIndex("by_draft", (q) => q.eq("draftId", args.draftId))
      .collect();
    for (const b of existing) {
      if (b.index === args.index) await ctx.db.delete("draftBatches", b._id);
    }

    await ctx.db.insert("draftBatches", {
      draftId: args.draftId,
      index: args.index,
      startPage: args.startPage,
      endPage: args.endPage,
      markdown: args.markdown,
    });

    const iconTokens = [
      ...new Set([...draft.iconTokens, ...args.newIconTokens]),
    ];
    const sectionHeadings = [
      ...new Set([...draft.sectionHeadings, ...args.newSectionHeadings]),
    ];
    const prev = draft.geminiUsage ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
    await ctx.db.patch("migrationDrafts", args.draftId, {
      nextBatchIndex: args.index + 1,
      iconTokens,
      sectionHeadings,
      geminiUsage: {
        promptTokens: prev.promptTokens + args.usage.promptTokens,
        completionTokens: prev.completionTokens + args.usage.completionTokens,
        totalTokens: prev.totalTokens + args.usage.totalTokens,
      },
    });

    await ctx.db.insert("usageLog", {
      purpose: "parse",
      model: "gemini-2.5-flash",
      promptTokens: args.usage.promptTokens,
      completionTokens: args.usage.completionTokens,
      totalTokens: args.usage.totalTokens,
    });
  },
});

export const setDraftError = internalMutation({
  args: { draftId: v.id("migrationDrafts"), error: v.string() },
  handler: async (ctx, { draftId, error }) => {
    await ctx.db.patch("migrationDrafts", draftId, { error });
  },
});

/**
 * Watchdog: if a batch worker was killed mid-run (OOM/timeout), its try/catch
 * never fires, so the draft would hang silently. This runs a while after a batch
 * starts and marks the draft errored if it made no progress — turning a silent
 * stall into a visible failure. No-op if the batch advanced or already errored.
 */
export const markStalledIfNoProgress = internalMutation({
  args: { draftId: v.id("migrationDrafts"), expectedIndex: v.number() },
  handler: async (ctx, { draftId, expectedIndex }) => {
    const draft = await ctx.db.get("migrationDrafts", draftId);
    if (!draft) return;
    if (
      draft.status === "parsing" &&
      draft.nextBatchIndex === expectedIndex &&
      !draft.error
    ) {
      await ctx.db.patch("migrationDrafts", draftId, {
        error:
          "Parsing stalled on this page range — the PDF may be too large or image-heavy to process. Try uploading a smaller or compressed PDF, then re-ingest.",
      });
    }
  },
});

export const getBatchesMarkdown = internalQuery({
  args: { draftId: v.id("migrationDrafts") },
  handler: async (ctx, { draftId }) => {
    const draft = await ctx.db.get("migrationDrafts", draftId);
    const batches = await ctx.db
      .query("draftBatches")
      .withIndex("by_draft", (q) => q.eq("draftId", draftId))
      .take(1000);
    return {
      gameTitle: draft?.gameTitle ?? "",
      markdowns: batches.sort((a, b) => a.index - b.index).map((b) => b.markdown),
    };
  },
});

export const saveDraftChunks = internalMutation({
  args: {
    draftId: v.id("migrationDrafts"),
    chunks: v.array(draftChunkInput),
    startOrder: v.number(),
  },
  handler: async (ctx, { draftId, chunks, startOrder }) => {
    let order = startOrder;
    for (const c of chunks) {
      await ctx.db.insert("draftChunks", {
        draftId,
        order: order++,
        breadcrumb: c.breadcrumb,
        page: c.page,
        chunkType: c.chunkType,
        scope: c.scope,
        variantName: c.variantName,
        text: c.text,
        flags: c.flags,
        accepted: true,
        edited: false,
      });
    }
  },
});

export const finishParse = internalMutation({
  args: { draftId: v.id("migrationDrafts") },
  handler: async (ctx, { draftId }) => {
    const draft = await ctx.db.get("migrationDrafts", draftId);
    if (!draft) return;
    await ctx.db.patch("migrationDrafts", draftId, { status: "parsed" });
    await ctx.db.patch("rulebooks", draft.rulebookId, {
      ingestState: "parsed",
    });
  },
});

export const getAcceptedForCommit = internalQuery({
  args: { rulebookId: v.id("rulebooks") },
  handler: async (ctx, { rulebookId }) => {
    const draft = await ctx.db
      .query("migrationDrafts")
      .withIndex("by_rulebook", (q) => q.eq("rulebookId", rulebookId))
      .order("desc")
      .first();
    if (!draft) return null;
    const chunks = await ctx.db
      .query("draftChunks")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
      .take(5000);
    const accepted = chunks
      .filter((c) => c.accepted && c.text.trim())
      .sort((a, b) => a.order - b.order);
    return {
      draftId: draft._id,
      gameId: draft.gameId,
      chunks: accepted.map((c) => ({
        breadcrumb: c.breadcrumb,
        page: c.page,
        chunkType: c.chunkType,
        scope: c.scope,
        variantName: c.variantName,
        text: c.text,
      })),
    };
  },
});

const normChunkType = (t: string): "text" | "table" | "list" | "legend" =>
  t === "table" || t === "list" || t === "legend" ? t : "text";
const normScope = (s: string): "main" | "variant" =>
  s === "variant" ? "variant" : "main";

/** Delete a rulebook's existing committed chunks (call before re-inserting). */
export const clearRulebookChunks = internalMutation({
  args: { rulebookId: v.id("rulebooks") },
  handler: async (ctx, { rulebookId }) => {
    const existing = await ctx.db
      .query("chunks")
      .withIndex("by_rulebook", (q) => q.eq("rulebookId", rulebookId))
      .take(5000);
    for (const c of existing) await ctx.db.delete("chunks", c._id);
  },
});

/** Insert one batch of embedded chunks. */
export const insertCommittedChunks = internalMutation({
  args: {
    rulebookId: v.id("rulebooks"),
    gameId: v.id("games"),
    chunks: v.array(
      v.object({
        breadcrumb: v.string(),
        page: v.optional(v.number()),
        chunkType: v.string(),
        scope: v.string(),
        variantName: v.optional(v.string()),
        text: v.string(),
        embedding: v.array(v.float64()),
      }),
    ),
  },
  handler: async (ctx, { rulebookId, gameId, chunks }) => {
    for (const c of chunks) {
      await ctx.db.insert("chunks", {
        rulebookId,
        gameId,
        breadcrumb: c.breadcrumb,
        page: c.page,
        chunkType: normChunkType(c.chunkType),
        scope: normScope(c.scope),
        variantName: c.variantName,
        text: c.text,
        embedding: c.embedding,
      });
    }
  },
});

/** Mark the rulebook ingested + draft committed, and log embedding usage. */
export const finalizeCommit = internalMutation({
  args: {
    rulebookId: v.id("rulebooks"),
    draftId: v.id("migrationDrafts"),
    embedTokens: v.number(),
  },
  handler: async (ctx, { rulebookId, draftId, embedTokens }) => {
    const rb = await ctx.db.get("rulebooks", rulebookId);
    await ctx.db.patch("rulebooks", rulebookId, {
      isIngested: true,
      ingestState: "committed",
    });
    await ctx.db.patch("migrationDrafts", draftId, { status: "committed" });
    await ctx.db.insert("usageLog", {
      purpose: "embed",
      model: "gemini-embedding-001",
      promptTokens: embedTokens,
      completionTokens: 0,
      totalTokens: embedTokens,
    });
    // Mark the game's family chat-ready now that a rulebook is ingested.
    if (rb) await recomputeChatReady(ctx, rb.gameId);
    // Refresh the derived detail-page content (FAQ, glossary, components) from
    // the freshly-ingested rulebook. Both resolve to the base game's family.
    if (rb) {
      await ctx.scheduler.runAfter(0, internal.faqs.generateForGame, {
        gameId: rb.gameId,
      });
      await ctx.scheduler.runAfter(0, internal.glossary.generateForGame, {
        gameId: rb.gameId,
      });
      await ctx.scheduler.runAfter(0, internal.reminders.generateForGame, {
        gameId: rb.gameId,
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Public — the admin review UI
// ---------------------------------------------------------------------------

export const getIngestStatus = query({
  args: { rulebookId: v.id("rulebooks") },
  handler: async (ctx, { rulebookId }) => {
    await requireAdmin(ctx);
    const draft = await ctx.db
      .query("migrationDrafts")
      .withIndex("by_rulebook", (q) => q.eq("rulebookId", rulebookId))
      .order("desc")
      .first();
    if (!draft) return null;
    return {
      draftId: draft._id,
      status: draft.status,
      control: draft.control ?? "running",
      totalPages: draft.totalPages,
      totalBatches: draft.batchPlan.length,
      batchesDone: draft.nextBatchIndex,
      removedDuplicates: draft.removedDuplicates ?? 0,
      geminiUsage: draft.geminiUsage,
      error: draft.error,
    };
  },
});

/** Find the newest draft for a rulebook (admin-gated helper). */
async function requireDraft(ctx: MutationCtx, rulebookId: Id<"rulebooks">) {
  await requireAdmin(ctx);
  const draft = await ctx.db
    .query("migrationDrafts")
    .withIndex("by_rulebook", (q) => q.eq("rulebookId", rulebookId))
    .order("desc")
    .first();
  return draft;
}

/** Pause the background parse loop (progress is kept; resume to continue). */
export const pauseIngestion = mutation({
  args: { rulebookId: v.id("rulebooks") },
  handler: async (ctx, { rulebookId }) => {
    const draft = await requireDraft(ctx, rulebookId);
    if (draft && draft.status === "parsing") {
      await ctx.db.patch("migrationDrafts", draft._id, { control: "paused" });
    }
  },
});

/** Stop (cancel) the parse loop. Partial progress is kept; restart to redo. */
export const stopIngestion = mutation({
  args: { rulebookId: v.id("rulebooks") },
  handler: async (ctx, { rulebookId }) => {
    const draft = await requireDraft(ctx, rulebookId);
    if (draft && draft.status === "parsing") {
      await ctx.db.patch("migrationDrafts", draft._id, { control: "stopped" });
    }
  },
});

/** Resume a paused/stopped parse loop from the current batch index. */
export const resumeIngestion = mutation({
  args: { rulebookId: v.id("rulebooks") },
  handler: async (ctx, { rulebookId }) => {
    const draft = await requireDraft(ctx, rulebookId);
    if (!draft || draft.status !== "parsing") return;
    await ctx.db.patch("migrationDrafts", draft._id, {
      control: "running",
      error: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.ingestion.processBatch, {
      draftId: draft._id,
    });
  },
});

export const listDraftChunks = query({
  args: { rulebookId: v.id("rulebooks") },
  handler: async (ctx, { rulebookId }) => {
    await requireAdmin(ctx);
    const draft = await ctx.db
      .query("migrationDrafts")
      .withIndex("by_rulebook", (q) => q.eq("rulebookId", rulebookId))
      .order("desc")
      .first();
    if (!draft) return [];
    const chunks = await ctx.db
      .query("draftChunks")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
      .take(5000);
    return chunks.sort((a, b) => a.order - b.order);
  },
});

export const updateDraftChunk = mutation({
  args: {
    draftChunkId: v.id("draftChunks"),
    text: v.optional(v.string()),
    breadcrumb: v.optional(v.string()),
    accepted: v.optional(v.boolean()),
  },
  handler: async (ctx, { draftChunkId, text, breadcrumb, accepted }) => {
    await requireAdmin(ctx);
    const chunk = await ctx.db.get("draftChunks", draftChunkId);
    if (!chunk) throw new Error("Chunk not found");

    const patch: Record<string, unknown> = {};
    if (text !== undefined && text !== chunk.text) {
      patch.text = text;
      patch.edited = true;
      if (chunk.originalText === undefined) patch.originalText = chunk.text;
    }
    if (breadcrumb !== undefined && breadcrumb !== chunk.breadcrumb) {
      patch.breadcrumb = breadcrumb;
      patch.edited = true;
    }
    if (accepted !== undefined) patch.accepted = accepted;
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch("draftChunks", draftChunkId, patch);
      const draft = await ctx.db.get("migrationDrafts", chunk.draftId);
      if (draft?.status === "parsed" || draft?.status === "committed") {
        await ctx.db.patch("migrationDrafts", chunk.draftId, {
          status: "reviewing",
        });
      }
    }
  },
});

/**
 * Insert a brand-new chunk the AI missed. `afterChunkId` places it right after
 * that chunk (omit to insert at the very top); order is set to the midpoint so
 * no other rows need re-numbering.
 */
export const insertDraftChunk = mutation({
  args: {
    rulebookId: v.id("rulebooks"),
    afterChunkId: v.optional(v.id("draftChunks")),
    breadcrumb: v.string(),
    text: v.string(),
    page: v.optional(v.number()),
    chunkType: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { rulebookId, afterChunkId, breadcrumb, text, page, chunkType },
  ) => {
    const draft = await requireDraft(ctx, rulebookId);
    if (!draft) throw new Error("No ingestion draft for this rulebook");

    const all = (
      await ctx.db
        .query("draftChunks")
        .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
        .take(5000)
    ).sort((a, b) => a.order - b.order);

    let order: number;
    if (!afterChunkId) {
      order = all.length ? all[0].order - 1 : 0;
    } else {
      const idx = all.findIndex((c) => c._id === afterChunkId);
      if (idx === -1) throw new Error("Anchor chunk not found");
      const a = all[idx].order;
      const next = all[idx + 1];
      order = next ? (a + next.order) / 2 : a + 1;
    }

    const id = await ctx.db.insert("draftChunks", {
      draftId: draft._id,
      order,
      breadcrumb,
      page,
      chunkType: chunkType ?? "rules",
      scope: "shared",
      text,
      flags: [],
      accepted: true,
      edited: true,
    });
    if (draft.status === "parsed" || draft.status === "committed") {
      await ctx.db.patch("migrationDrafts", draft._id, { status: "reviewing" });
    }
    return id;
  },
});

/** Delete a draft chunk entirely (e.g. a manually-added one, or pure noise). */
export const deleteDraftChunk = mutation({
  args: { draftChunkId: v.id("draftChunks") },
  handler: async (ctx, { draftChunkId }) => {
    await requireAdmin(ctx);
    const chunk = await ctx.db.get("draftChunks", draftChunkId);
    if (!chunk) return;
    await ctx.db.delete("draftChunks", draftChunkId);
    const draft = await ctx.db.get("migrationDrafts", chunk.draftId);
    if (draft?.status === "parsed") {
      await ctx.db.patch("migrationDrafts", chunk.draftId, {
        status: "reviewing",
      });
    }
  },
});
