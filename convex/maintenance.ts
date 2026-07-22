import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { finite } from "./lib/num";
import { deleteUserAndAuth, deleteUserAppData } from "./lib/purge";

/** Abandoned (non-committed) ingestion drafts older than this are purged. */
const STALE_DRAFT_MS = 7 * 24 * 60 * 60 * 1000;
/** Anonymous guests idle this long (and this old) are purged. */
const ABANDONED_GUEST_MS = 30 * 24 * 60 * 60 * 1000;
/** How many rows a single cascade step deletes before rescheduling itself. */
const DELETE_PAGE = 500;

/**
 * Nightly safety net: zero every user's daily token counter and stamp the new
 * window. `reserveBudget` already resets lazily on the next request, but a user
 * who never comes back would otherwise keep a stale counter — and it lets the
 * "tokens left today" display stay accurate without wall-clock math in queries.
 * Batched + self-rescheduling so it scales past a single transaction.
 */
export const resetDailyBudgets = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const now = Date.now();
    const page = await ctx.db
      .query("users")
      .paginate({ cursor: cursor ?? null, numItems: 100 });

    for (const user of page.page) {
      if ((user.tokensUsedToday ?? 0) !== 0) {
        await ctx.db.patch("users", user._id, {
          tokensUsedToday: 0,
          tokensResetAt: now,
        });
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.maintenance.resetDailyBudgets, {
        cursor: page.continueCursor,
      });
    }
  },
});

/**
 * One-off repair: rewrite any NaN/Infinity token counters left behind by the
 * earlier bug (a NaN passes `v.number()` and can't be caught by `?? 0`).
 * Idempotent — safe to run repeatedly. Kicks off both table repairs. Convex
 * allows only one paginated query per function, so each table gets its own.
 */
export const repairTokenCounters = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.maintenance.repairUserCounters, {});
    await ctx.scheduler.runAfter(0, internal.maintenance.repairUsageLog, {});
  },
});

export const repairUserCounters = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const users = await ctx.db
      .query("users")
      .paginate({ cursor: cursor ?? null, numItems: 200 });
    for (const u of users.page) {
      if (!Number.isFinite(u.tokensUsedToday ?? 0)) {
        await ctx.db.patch("users", u._id, { tokensUsedToday: 0 });
      }
    }
    if (!users.isDone) {
      await ctx.scheduler.runAfter(0, internal.maintenance.repairUserCounters, {
        cursor: users.continueCursor,
      });
    }
  },
});

export const repairUsageLog = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const logs = await ctx.db
      .query("usageLog")
      .paginate({ cursor: cursor ?? null, numItems: 200 });
    for (const r of logs.page) {
      if (
        !Number.isFinite(r.promptTokens) ||
        !Number.isFinite(r.completionTokens) ||
        !Number.isFinite(r.totalTokens)
      ) {
        await ctx.db.patch("usageLog", r._id, {
          promptTokens: finite(r.promptTokens),
          completionTokens: finite(r.completionTokens),
          totalTokens: finite(r.totalTokens),
        });
      }
    }
    if (!logs.isDone) {
      await ctx.scheduler.runAfter(0, internal.maintenance.repairUsageLog, {
        cursor: logs.continueCursor,
      });
    }
  },
});

/**
 * Nightly: find abandoned ingestion drafts (parsed/parsing but never committed,
 * older than STALE_DRAFT_MS) and schedule a cascade delete for each. Committed
 * drafts are kept as the ingestion record.
 */
export const cleanupStaleDrafts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - STALE_DRAFT_MS;
    const drafts = await ctx.db.query("migrationDrafts").take(200);
    for (const draft of drafts) {
      if (draft.status !== "committed" && draft._creationTime < cutoff) {
        await ctx.scheduler.runAfter(0, internal.maintenance.deleteDraftCascade, {
          draftId: draft._id,
        });
      }
    }
  },
});

/**
 * Nightly: purge abandoned anonymous guests — created over ABANDONED_GUEST_MS
 * ago with no chat activity since. Real accounts and still-active guests are
 * left alone. Each purge is scheduled separately to bound its transaction.
 */
export const cleanupAbandonedGuests = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const cutoff = Date.now() - ABANDONED_GUEST_MS;
    const page = await ctx.db
      .query("users")
      .paginate({ cursor: cursor ?? null, numItems: 100 });

    for (const u of page.page) {
      if (u.isAnonymous !== true || u._creationTime >= cutoff) continue;
      const chats = await ctx.db
        .query("chats")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .take(50);
      const lastActive = chats.reduce(
        (max, c) => Math.max(max, c.lastMessageAt ?? 0),
        0,
      );
      if (lastActive >= cutoff) continue; // still active — keep
      await ctx.scheduler.runAfter(0, internal.maintenance.purgeGuest, {
        userId: u._id,
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.maintenance.cleanupAbandonedGuests,
        { cursor: page.continueCursor },
      );
    }
  },
});

/** Delete one guest's data + auth rows + user row. Re-checks it's still a guest
 *  (it may have been upgraded since it was queued). */
export const purgeGuest = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    if (!user || user.isAnonymous !== true) return;
    await deleteUserAppData(ctx, userId);
    await deleteUserAndAuth(ctx, userId);
  },
});

/**
 * Delete a draft and its children in bounded pages, rescheduling until empty so
 * a huge draft never blows a single transaction's write limit.
 */
export const deleteDraftCascade = internalMutation({
  args: { draftId: v.id("migrationDrafts") },
  handler: async (ctx, { draftId }) => {
    const chunks = await ctx.db
      .query("draftChunks")
      .withIndex("by_draft", (q) => q.eq("draftId", draftId))
      .take(DELETE_PAGE);
    for (const c of chunks) await ctx.db.delete("draftChunks", c._id);
    if (chunks.length === DELETE_PAGE) {
      await ctx.scheduler.runAfter(0, internal.maintenance.deleteDraftCascade, {
        draftId,
      });
      return;
    }

    const batches = await ctx.db
      .query("draftBatches")
      .withIndex("by_draft", (q) => q.eq("draftId", draftId))
      .take(DELETE_PAGE);
    for (const b of batches) await ctx.db.delete("draftBatches", b._id);
    if (batches.length === DELETE_PAGE) {
      await ctx.scheduler.runAfter(0, internal.maintenance.deleteDraftCascade, {
        draftId,
      });
      return;
    }

    await ctx.db.delete("migrationDrafts", draftId);
  },
});
