import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { finite } from "./lib/num";
import { deleteUserAndAuth, deleteUserAppData } from "./lib/purge";

/** Abandoned (non-committed) ingestion drafts older than this are purged. */
const STALE_DRAFT_MS = 7 * 24 * 60 * 60 * 1000;
/** Anonymous guests idle this long (and this old) are purged. */
const ABANDONED_GUEST_MS = 30 * 24 * 60 * 60 * 1000;
/** Anonymous guests that never sent a message are purged once this old. */
const EMPTY_GUEST_MS = 48 * 60 * 60 * 1000;
/** How many rows a single cascade step deletes before rescheduling itself. */
const DELETE_PAGE = 500;

/**
 * Nightly safety net: zero every non-zero daily token counter (`userBudgets`)
 * and stamp the new window. `reserveBudget` already resets lazily on the next
 * request, but a user who never comes back would otherwise keep a stale counter
 * — and it lets the "tokens left today" display stay accurate. Reads only rows
 * with tokensUsedToday > 0 (via index), not every user. Each zeroed row leaves
 * that index range, so a batch that fills up just reschedules itself.
 * `cursor` is unused (kept so the cron's call signature is unchanged).
 */
const BUDGET_RESET_PAGE = 100;
export const resetDailyBudgets = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("userBudgets")
      .withIndex("by_tokensUsedToday", (q) => q.gt("tokensUsedToday", 0))
      .take(BUDGET_RESET_PAGE);

    for (const row of rows) {
      await ctx.db.patch("userBudgets", row._id, {
        tokensUsedToday: 0,
        tokensResetAt: now,
      });
    }

    if (rows.length === BUDGET_RESET_PAGE) {
      await ctx.scheduler.runAfter(0, internal.maintenance.resetDailyBudgets, {});
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
 * Daily: recompute the `userStats` singleton the admin dashboard reads —
 * total / registered / guest headcounts, plus the guest active-vs-empty split.
 *
 * This is the one place that still scans the whole users table (users live in
 * the auth component, so there's no per-insert hook to keep a live counter).
 * Running it once a day here — instead of on every dashboard load / message —
 * is the whole point: the dashboard queries then read one small doc. Paginated
 * with a threaded accumulator so it stays inside a single transaction's limits;
 * the totals are written only on the final page. Also serves as the backfill:
 * `npx convex run maintenance:recomputeUserCounters` (add --prod for prod).
 */
const USER_STATS_PAGE = 100;
const emptyUserAcc = {
  users: 0,
  registered: 0,
  guests: 0,
  activeGuests: 0,
  emptyGuests: 0,
};
export const recomputeUserCounters = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    acc: v.optional(
      v.object({
        users: v.number(),
        registered: v.number(),
        guests: v.number(),
        activeGuests: v.number(),
        emptyGuests: v.number(),
      }),
    ),
  },
  handler: async (ctx, { cursor, acc }) => {
    const a = { ...emptyUserAcc, ...acc };
    const page = await ctx.db
      .query("users")
      .paginate({ cursor: cursor ?? null, numItems: USER_STATS_PAGE });

    for (const u of page.page) {
      a.users++;
      if (u.isAnonymous !== true) {
        a.registered++;
        continue;
      }
      a.guests++;
      // Same activity signal the guest-cleanup sweeps use.
      const chats = await ctx.db
        .query("chats")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .take(50);
      if (chats.some((c) => (c.lastMessageAt ?? 0) > 0)) a.activeGuests++;
      else a.emptyGuests++;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.maintenance.recomputeUserCounters,
        { cursor: page.continueCursor, acc: a },
      );
      return;
    }

    const doc = { ...a, updatedAt: Date.now() };
    const existing = await ctx.db.query("userStats").first();
    if (existing) await ctx.db.patch("userStats", existing._id, doc);
    else await ctx.db.insert("userStats", doc);
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
    // Read only non-committed drafts older than the cutoff (committed drafts are
    // kept forever, so an unfiltered scan mostly read rows it would skip).
    let budget = 200;
    for (const status of ["parsing", "parsed", "reviewing"] as const) {
      if (budget <= 0) break;
      const drafts = await ctx.db
        .query("migrationDrafts")
        .withIndex("by_status", (q) =>
          q.eq("status", status).lt("_creationTime", cutoff),
        )
        .take(budget);
      budget -= drafts.length;
      for (const draft of drafts) {
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
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    // Fixed on the first page and threaded through continuations, so every
    // page paginates the same index range (a cursor needs a stable query).
    cutoff: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = args.cutoff ?? Date.now() - ABANDONED_GUEST_MS;
    // Only guests (isAnonymous === true) created before the cutoff — exactly
    // the rows the old full-table scan acted on; everything else is skipped
    // by the index range instead of being read.
    const page = await ctx.db
      .query("users")
      .withIndex("by_isAnonymous", (q) =>
        q.eq("isAnonymous", true).lt("_creationTime", cutoff),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: 100 });

    for (const u of page.page) {
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
        { cursor: page.continueCursor, cutoff },
      );
    }
  },
});

/**
 * Nightly: purge "empty" anonymous guests — created over EMPTY_GUEST_MS ago
 * that never sent a single message. These are almost entirely bots/crawlers
 * and link unfurlers that trip the anonymous sign-in without ever chatting.
 * Guests who *did* chat are left to the 30-day `cleanupAbandonedGuests` sweep.
 * Uses `chat.lastMessageAt` as the activity signal (same as that sweep). Each
 * purge is scheduled separately to bound its transaction.
 */
export const cleanupEmptyGuests = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    cutoff: v.optional(v.number()), // see cleanupAbandonedGuests
  },
  handler: async (ctx, args) => {
    const cutoff = args.cutoff ?? Date.now() - EMPTY_GUEST_MS;
    const page = await ctx.db
      .query("users")
      .withIndex("by_isAnonymous", (q) =>
        q.eq("isAnonymous", true).lt("_creationTime", cutoff),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: 100 });

    for (const u of page.page) {
      const chats = await ctx.db
        .query("chats")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .take(50);
      const everActive = chats.some((c) => (c.lastMessageAt ?? 0) > 0);
      if (everActive) continue; // has real activity — leave it to the 30-day sweep
      await ctx.scheduler.runAfter(0, internal.maintenance.purgeGuest, {
        userId: u._id,
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.maintenance.cleanupEmptyGuests, {
        cursor: page.continueCursor,
        cutoff,
      });
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
