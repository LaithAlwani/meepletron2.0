import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getCurrentUser, requireUser } from "./lib/auth";
import {
  backoffMs,
  bggGet,
  bggLogin,
  isRetryableStatus,
  MAX_ATTEMPTS,
} from "./lib/bggFetch";
import { seal } from "./lib/bggCrypto";
import { parseCollectionXml, type BggCollectionItem } from "./lib/bggXml";
import { bggCollectionItemValidator } from "./lib/bggSyncTypes";
import { slugifyUnique } from "./lib/slug";

/**
 * BoardGameGeek account linking + collection sync.
 *
 * Shape of the pipeline: one HTTP request per scheduled action invocation, with
 * retries handed to the scheduler rather than slept on inside an action. This
 * mirrors internal.ingestion.processBatch, which the codebase already runs.
 *
 * Deletions are mark-and-sweep: every row a run touches is stamped with the
 * run's `runStartedAt`, and rows still carrying an older stamp when the run
 * finishes are the ones the user no longer owns.
 */

/** Refuse a re-sync inside this window — the main defence against hammering BGG. */
const MIN_SYNC_INTERVAL_MS = 15 * 60 * 1000;
/** Rows per import transaction. */
const IMPORT_BATCH = 100;
/** Rows per sweep transaction. */
const SWEEP_BATCH = 500;
/** A job with no heartbeat for this long is considered dead. */
const STALL_MS = 10 * 60 * 1000;
/**
 * Master switch for stub enrichment. When on, a sync's import phase is followed
 * by the enrichment phase (fill each stub with BGG metadata + a cover, narrating
 * progress). `as boolean` keeps both branches reachable for the type checker.
 */
const ENRICH_ENABLED = true as boolean;
/** Stub games enriched per sweep pass — the ceiling on BGG /thing traffic. */
const ENRICH_BATCH = 12;
/** Gap between /thing fetches within a pass, so a batch isn't a burst. */
const ENRICH_STAGGER_MS = 3000;

const USERNAME_RE = /^[A-Za-z0-9_.\-]{1,64}$/;

/* -------------------------------------------------------------------------- */
/* Account linking                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Link a BGG account.
 *
 * The password is used exactly once, here, to obtain a session cookie, and is
 * then discarded — it is never written to the database or to a log. The cookie
 * is sealed before storage. When it expires the account moves to
 * `needs_reauth` and the user re-enters their password; we deliberately do not
 * keep the password around to renew silently.
 */
export const linkAccount = action({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, { username, password }): Promise<{ username: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("Sign in to link a BoardGameGeek account.");
    }
    await ctx.runQuery(internal.bggSync.ensureLinkable, {});

    const trimmed = username.trim();
    if (!USERNAME_RE.test(trimmed)) {
      throw new ConvexError("That doesn't look like a BoardGameGeek username.");
    }

    let login: { cookie: string; expiresAt?: number } | null;
    try {
      login = await bggLogin(trimmed, password);
    } catch (e) {
      // Classify without ever touching the response body — it can echo back
      // what was posted.
      const code = e instanceof Error ? e.message : "";
      const reason = code.includes("429") ? "rate_limited" : "bgg_unavailable";
      await ctx.runMutation(internal.bggSync.saveAccount, {
        userId,
        username: trimmed,
        status: "error",
        lastError: reason,
      });
      throw new ConvexError(
        reason === "rate_limited"
          ? "BoardGameGeek is rate-limiting sign-ins right now. Try again in a few minutes."
          : "Couldn't reach BoardGameGeek. Try again shortly.",
      );
    }

    if (!login) {
      await ctx.runMutation(internal.bggSync.saveAccount, {
        userId,
        username: trimmed,
        status: "error",
        lastError: "bad_credentials",
      });
      throw new ConvexError(
        "BoardGameGeek didn't accept that username and password.",
      );
    }

    const sessionCookie = await seal(login.cookie);
    await ctx.runMutation(internal.bggSync.saveAccount, {
      userId,
      username: trimmed,
      status: "linked",
      sessionCookie,
      cookieExpiresAt: login.expiresAt,
    });

    // Kick off the first collection sync so linking has a visible result.
    await ctx.runMutation(internal.bggSync.beginCollectionSync, { userId });
    return { username: trimmed };
  },
});

/** Guard: signed in, and not an auto-purged anonymous guest. */
export const ensureLinkable = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.isAnonymous) {
      throw new ConvexError(
        "Create an account before linking BoardGameGeek — guest sessions are temporary.",
      );
    }
    return { userId: user._id };
  },
});

export const saveAccount = internalMutation({
  args: {
    userId: v.id("users"),
    username: v.string(),
    status: v.union(
      v.literal("linked"),
      v.literal("needs_reauth"),
      v.literal("error"),
    ),
    sessionCookie: v.optional(v.object({ ct: v.string(), iv: v.string() })),
    cookieExpiresAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("bggAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    const fields = {
      userId: args.userId,
      username: args.username,
      usernameLower: args.username.toLowerCase(),
      status: args.status,
      sessionCookie: args.sessionCookie,
      cookieExpiresAt: args.cookieExpiresAt,
      lastError: args.lastError,
    };

    if (!existing) {
      return await ctx.db.insert("bggAccounts", { ...fields, linkedAt: Date.now() });
    }

    // Switching to a different BGG username invalidates the synced rows.
    if (existing.usernameLower !== fields.usernameLower) {
      await ctx.scheduler.runAfter(0, internal.bggSync.purgeUserBggData, {
        userId: args.userId,
      });
    }
    await ctx.db.patch("bggAccounts", existing._id, fields);
    return existing._id;
  },
});

export const unlinkAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const account = await ctx.db
      .query("bggAccounts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (account) await ctx.db.delete("bggAccounts", account._id);

    const jobs = await ctx.db
      .query("bggSyncJobs")
      .withIndex("by_user_and_kind", (q) => q.eq("userId", user._id))
      .take(10);
    for (const j of jobs) await ctx.db.delete("bggSyncJobs", j._id);

    // The collection itself can be thousands of rows — cascade out of band.
    await ctx.scheduler.runAfter(0, internal.bggSync.purgeUserBggData, {
      userId: user._id,
    });
  },
});

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The caller's own linked account. Explicitly projected: the sealed cookie must
 * never cross the wire, and a `select *` here would ship it to every client.
 */
export const myAccount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const account = await ctx.db
      .query("bggAccounts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!account) return null;
    return {
      username: account.username,
      status: account.status,
      lastError: account.lastError,
      linkedAt: account.linkedAt,
      collectionSyncedAt: account.collectionSyncedAt,
      collectionCount: account.collectionCount,
      playsSyncedAt: account.playsSyncedAt,
      playsCount: account.playsCount,
    };
  },
});

/** The caller's ≤2 sync jobs, for the progress UI. Reactive, so no polling. */
export const myJobs = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const jobs = await ctx.db
      .query("bggSyncJobs")
      .withIndex("by_user_and_kind", (q) => q.eq("userId", user._id))
      .take(10);
    return jobs.map((j) => ({
      kind: j.kind,
      status: j.status,
      processed: j.processed,
      total: j.total,
      created: j.created,
      recentTitles: j.recentTitles,
      enrichTotal: j.enrichTotal,
      enrichProcessed: j.enrichProcessed,
      currentTitle: j.currentTitle,
      page: j.page,
      totalPages: j.totalPages,
      error: j.error,
      updatedAt: j.updatedAt,
    }));
  },
});

export const myCollection = query({
  args: {
    paginationOpts: paginationOptsValidator,
    // Categories map 1:1 to a BGG status flag (want + preordered are already
    // folded into `wishlist` at import). `all` shows the whole collection.
    filter: v.optional(
      v.union(
        v.literal("owned"),
        v.literal("wishlist"),
        v.literal("wantToPlay"),
        v.literal("prevOwned"),
        v.literal("forTrade"),
        v.literal("all"),
      ),
    ),
  },
  handler: async (ctx, { paginationOpts, filter }) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const FIELD = {
      owned: "own",
      wishlist: "wishlist",
      wantToPlay: "wantToPlay",
      prevOwned: "prevOwned",
      forTrade: "forTrade",
    } as const;

    let q = ctx.db
      .query("bggCollection")
      .withIndex("by_user_and_sort_title", (qq) => qq.eq("userId", user._id));
    // `.filter` doesn't reduce rows read, but a single user's collection is
    // bounded at a couple of thousand rows, so the scan stays cheap.
    if (filter && filter !== "all") {
      const field = FIELD[filter];
      q = q.filter((qq) => qq.eq(qq.field(field), true));
    }

    const result = await q.paginate(paginationOpts);
    // The collection renders library-style GameCards, so return the linked game
    // + media. Rows whose game was deleted are dropped (nothing to card).
    const page = (
      await Promise.all(
        result.page.map(async (row) => {
          if (!row.gameId) return null;
          const game = await ctx.db.get("games", row.gameId);
          if (!game) return null;
          const [imageUrl, storedThumb] = await Promise.all([
            game.imageId
              ? ctx.storage.getUrl(game.imageId)
              : Promise.resolve(null),
            game.thumbnailId
              ? ctx.storage.getUrl(game.thumbnailId)
              : Promise.resolve(null),
          ]);
          // Fall back to the BGG thumbnail on the row when there's no stored cover.
          return {
            ...game,
            imageUrl,
            thumbnailUrl: storedThumb ?? row.thumbnailUrl ?? null,
          };
        }),
      )
    ).flatMap((g) => (g ? [g] : []));
    return { ...result, page };
  },
});

/* -------------------------------------------------------------------------- */
/* Starting and cancelling a sync                                             */
/* -------------------------------------------------------------------------- */

/** Upsert the single job row for (user, kind) and return its id. */
async function resetJob(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    accountId: Id<"bggAccounts">;
    username: string;
    kind: "collection" | "plays";
    mode: "incremental" | "full";
  },
): Promise<Id<"bggSyncJobs">> {
  const now = Date.now();
  const fields = {
    ...args,
    status: "queued" as const,
    runStartedAt: now,
    page: 1,
    totalPages: undefined,
    processed: 0,
    total: undefined,
    created: 0,
    recentTitles: [],
    enrichQueue: undefined,
    enrichTotal: undefined,
    enrichProcessed: undefined,
    currentTitle: undefined,
    attempts: 0,
    minDate: undefined,
    updatedAt: now,
    finishedAt: undefined,
    error: undefined,
  };
  const existing = await ctx.db
    .query("bggSyncJobs")
    .withIndex("by_user_and_kind", (q) =>
      q.eq("userId", args.userId).eq("kind", args.kind),
    )
    .unique();
  if (existing) {
    await ctx.db.patch("bggSyncJobs", existing._id, fields);
    return existing._id;
  }
  return await ctx.db.insert("bggSyncJobs", fields);
}

/** Statuses that mean "a run is under way" — the in-flight lock. */
const IN_FLIGHT = [
  "queued",
  "waiting",
  "running",
  "sweeping",
  "enriching",
] as const;

function isInFlight(status: string): boolean {
  return (IN_FLIGHT as readonly string[]).includes(status);
}

/** Reset the job row and schedule the fetch. Shared by the action and syncNow. */
async function startCollectionSync(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Id<"bggSyncJobs"> | null> {
  const account = await ctx.db
    .query("bggAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!account) return null;
  const jobId = await resetJob(ctx, {
    userId,
    accountId: account._id,
    username: account.username,
    kind: "collection",
    mode: "full",
  });
  await ctx.scheduler.runAfter(0, internal.bggSync.runCollection, { jobId });
  return jobId;
}

/** Entry point for actions, which can't touch ctx.db directly. */
export const beginCollectionSync = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => await startCollectionSync(ctx, userId),
});

/**
 * User-triggered sync. The cooldown here is what stops a user turning one
 * button into a flood of BGG requests.
 */
export const syncNow = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const account = await ctx.db
      .query("bggAccounts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!account) {
      throw new ConvexError("Link your BoardGameGeek account first.");
    }

    const job = await ctx.db
      .query("bggSyncJobs")
      .withIndex("by_user_and_kind", (q) =>
        q.eq("userId", user._id).eq("kind", "collection"),
      )
      .unique();
    if (job && isInFlight(job.status)) {
      throw new ConvexError("A sync is already running.");
    }
    if (
      account.collectionSyncedAt &&
      Date.now() - account.collectionSyncedAt < MIN_SYNC_INTERVAL_MS
    ) {
      throw new ConvexError(
        "Your collection was synced in the last 15 minutes — try again a bit later.",
      );
    }

    await startCollectionSync(ctx, user._id);
  },
});

export const cancelSync = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const job = await ctx.db
      .query("bggSyncJobs")
      .withIndex("by_user_and_kind", (q) =>
        q.eq("userId", user._id).eq("kind", "collection"),
      )
      .unique();
    if (!job) return;
    await ctx.db.patch("bggSyncJobs", job._id, {
      status: "canceled",
      finishedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/* -------------------------------------------------------------------------- */
/* Job bookkeeping                                                            */
/* -------------------------------------------------------------------------- */

export const getJob = internalQuery({
  args: { jobId: v.id("bggSyncJobs") },
  handler: async (ctx, { jobId }) => await ctx.db.get("bggSyncJobs", jobId),
});

export const markJobRunning = internalMutation({
  args: { jobId: v.id("bggSyncJobs"), total: v.optional(v.number()) },
  handler: async (ctx, { jobId, total }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job) return;
    await ctx.db.patch("bggSyncJobs", jobId, {
      status: "running",
      attempts: 0,
      ...(total !== undefined ? { total } : {}),
      updatedAt: Date.now(),
    });
  },
});

/** Records a transient failure and returns the new attempt count. */
export const markJobWaiting = internalMutation({
  args: { jobId: v.id("bggSyncJobs"), error: v.optional(v.string()) },
  handler: async (ctx, { jobId, error }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job) return null;
    const attempts = job.attempts + 1;
    await ctx.db.patch("bggSyncJobs", jobId, {
      status: "waiting",
      attempts,
      error,
      updatedAt: Date.now(),
    });
    return attempts;
  },
});

export const failJob = internalMutation({
  args: { jobId: v.id("bggSyncJobs"), error: v.string() },
  handler: async (ctx, { jobId, error }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job) return;
    await ctx.db.patch("bggSyncJobs", jobId, {
      status: "error",
      error,
      finishedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/* -------------------------------------------------------------------------- */
/* Collection import                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Find the local game for a BGG id, creating a stub when we don't curate it.
 *
 * The lookup and the insert must stay in one mutation: Convex's OCC then makes
 * two users syncing the same game conflict and retry, so only one stub is
 * created. Splitting them across an action boundary would race.
 */
async function linkOrCreateGame(
  ctx: MutationCtx,
  item: BggCollectionItem,
): Promise<{ gameId: Id<"games">; created: boolean }> {
  const existing = await ctx.db
    .query("games")
    .withIndex("by_bgg_id", (q) => q.eq("bggId", item.bggId))
    .first();
  if (existing) return { gameId: existing._id, created: false };

  const gameId = await ctx.db.insert("games", {
    title: item.title,
    slug: await slugifyUnique(ctx, item.title),
    isExpansion: item.isExpansion,
    isStub: true,
    year: item.year,
    bggId: item.bggId,
    designers: [],
    artists: [],
    publishers: [],
    categories: [],
    gameMechanics: [],
    // searchText deliberately left unset: a stub has nothing worth matching,
    // and this keeps it out of full-text search even before the isStub filter.
  });
  return { gameId, created: true };
}

export const upsertCollectionItems = internalMutation({
  args: {
    jobId: v.id("bggSyncJobs"),
    items: v.array(bggCollectionItemValidator),
  },
  handler: async (ctx, { jobId, items }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    // The job is gone when the account was unlinked or deleted mid-run. Bail
    // rather than writing rows nothing will ever clean up.
    if (!job || job.status === "canceled") return;

    let createdCount = 0;
    const titles: string[] = [];
    for (const item of items) {
      const { gameId, created } = await linkOrCreateGame(ctx, item);
      if (created) createdCount++;
      titles.push(item.title);
      // Own/wishlist are the user's to edit after the first import — never let a
      // re-sync clobber them. So on an existing row we refresh metadata only (the
      // raw status flags incl. want/preordered still update); a brand-new row is
      // seeded with the BGG status, folding want + preordered into wishlist.
      const { own, wishlist, ...meta } = item;
      const base = {
        ...meta,
        userId: job.userId,
        gameId,
        sortTitle: item.title.toLowerCase(),
        syncedAt: job.runStartedAt,
      };
      const seededWishlist =
        wishlist ||
        item.want ||
        item.wantToBuy ||
        item.preordered ||
        undefined;
      const existing = await ctx.db
        .query("bggCollection")
        .withIndex("by_user_and_bgg_id", (q) =>
          q.eq("userId", job.userId).eq("bggId", item.bggId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch("bggCollection", existing._id, base);
      } else {
        await ctx.db.insert("bggCollection", {
          ...base,
          own,
          wishlist: seededWishlist,
        });
      }
    }

    await ctx.db.patch("bggSyncJobs", jobId, {
      processed: job.processed + items.length,
      created: (job.created ?? 0) + createdCount,
      // A rolling window of the most recent titles — the UI shows what's copying.
      recentTitles: [...(job.recentTitles ?? []), ...titles].slice(-8),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Import done — finalise and hand off to enrichment. Re-sync is deliberately
 * additive: no destructive sweep, so games the user removed from BGG (or edited
 * in-app) are left alone. New BGG games were already inserted with their owned/
 * wishlist status by `upsertCollectionItems`.
 */
export const finishCollection = internalMutation({
  args: { jobId: v.id("bggSyncJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job || job.status === "canceled") return;

    const now = Date.now();
    const account = await ctx.db.get("bggAccounts", job.accountId);
    if (account) {
      await ctx.db.patch("bggAccounts", job.accountId, {
        collectionSyncedAt: now,
        collectionCount: job.processed,
      });
    }

    // Enrichment is the slow, per-game phase (BGG /thing + cover per stub). Gate
    // it behind the switch so it only runs when enabled; otherwise finish here.
    if (!ENRICH_ENABLED) {
      await ctx.db.patch("bggSyncJobs", jobId, {
        status: "done",
        finishedAt: now,
        updatedAt: now,
      });
      return;
    }

    // Build the queue from the collection rows only (small — no game docs), so
    // enrichment start stays cheap even for a big collection. The driver checks
    // each game's stub state one at a time as it walks the queue.
    const rows = await ctx.db
      .query("bggCollection")
      .withIndex("by_user_and_sort_title", (q) => q.eq("userId", job.userId))
      .take(5000);
    const queue = rows
      .map((r) => r.gameId)
      .filter((id): id is Id<"games"> => id != null);
    if (queue.length === 0) {
      await ctx.db.patch("bggSyncJobs", jobId, {
        status: "done",
        finishedAt: now,
        updatedAt: now,
      });
      return;
    }
    await ctx.db.patch("bggSyncJobs", jobId, {
      status: "enriching",
      enrichQueue: queue,
      enrichTotal: queue.length,
      enrichProcessed: 0,
      currentTitle: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.bggSync.runJobEnrichment, { jobId });
  },
});

/** How long a failed enrichment attempt backs off before it's retried. */
const ENRICH_RETRY_TTL_MS = 6 * 60 * 60 * 1000;

/** One game's enrichment-relevant fields — a single-doc read, bounded. */
export const getEnrichTarget = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const g = await ctx.db.get("games", gameId);
    if (!g) return null;
    return {
      isStub: g.isStub === true,
      bggId: g.bggId ?? null,
      title: g.title,
      bggCheckedAt: g.bggCheckedAt ?? null,
    };
  },
});

/** Narrate the game currently being enriched (heartbeat too). */
export const setEnrichCurrent = internalMutation({
  args: { jobId: v.id("bggSyncJobs"), title: v.string() },
  handler: async (ctx, { jobId, title }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job || job.status !== "enriching") return;
    await ctx.db.patch("bggSyncJobs", jobId, {
      currentTitle: title,
      updatedAt: Date.now(),
    });
  },
});

/** One game handled — advance the enrichment counter. */
export const bumpEnrichProcessed = internalMutation({
  args: { jobId: v.id("bggSyncJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job || job.status !== "enriching") return;
    await ctx.db.patch("bggSyncJobs", jobId, {
      enrichProcessed: (job.enrichProcessed ?? 0) + 1,
      updatedAt: Date.now(),
    });
  },
});

/** No stubs left — the sync (import + enrichment) is fully done. */
export const finishEnrichment = internalMutation({
  args: { jobId: v.id("bggSyncJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job || job.status !== "enriching") return;
    const now = Date.now();
    await ctx.db.patch("bggSyncJobs", jobId, {
      status: "done",
      currentTitle: undefined,
      finishedAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Enrichment driver: walks the job's queue by index (enrichProcessed), reading
 * one game per step. Unfilled stubs are enriched (BGG /thing + cover, staggered);
 * anything already filled is skipped instantly. The cursor advances before the
 * BGG call and the call is wrapped, so a single failure can never break the
 * reschedule chain — the whole run always drains to done. Enriching an expansion
 * also pulls in + fills its base game (see images.enrichSyncedGame).
 */
export const runJobEnrichment = internalAction({
  args: { jobId: v.id("bggSyncJobs") },
  handler: async (ctx, { jobId }): Promise<void> => {
    const job = await ctx.runQuery(internal.bggSync.getJob, { jobId });
    if (!job || job.status !== "enriching") return; // canceled / gone / done

    const queue = job.enrichQueue ?? [];
    const idx = job.enrichProcessed ?? 0;
    if (idx >= queue.length) {
      await ctx.runMutation(internal.bggSync.finishEnrichment, { jobId });
      return;
    }

    const gameId = queue[idx];
    const target = await ctx.runQuery(internal.bggSync.getEnrichTarget, {
      gameId,
    });
    // Advance the cursor first — a bad entry is skipped, never re-looped.
    await ctx.runMutation(internal.bggSync.bumpEnrichProcessed, { jobId });

    const due =
      target &&
      target.isStub &&
      !!target.bggId &&
      Date.now() - (target.bggCheckedAt ?? 0) >= ENRICH_RETRY_TTL_MS;

    if (due && target.bggId) {
      await ctx.runMutation(internal.bggSync.setEnrichCurrent, {
        jobId,
        title: target.title,
      });
      try {
        await ctx.runAction(internal.images.enrichSyncedGame, {
          gameId,
          bggId: target.bggId,
        });
      } catch {
        // Leave it a stub for the backstop cron; the chain must go on.
      }
      await ctx.scheduler.runAfter(
        ENRICH_STAGGER_MS,
        internal.bggSync.runJobEnrichment,
        { jobId },
      );
    } else {
      // Already filled / not a stub — no BGG call, move straight on.
      await ctx.scheduler.runAfter(0, internal.bggSync.runJobEnrichment, {
        jobId,
      });
    }
  },
});

/**
 * Fill a batch of stub games (auto-created by collection sync) with full BGG
 * metadata + a stored cover, promoting each to a real catalogue entry. Drains
 * itself: while a full batch of stubs remains it reschedules after the batch
 * has staggered through, so one sync — or the backstop cron — eventually
 * enriches everything without bursting BoardGameGeek.
 */
export const enrichStubs = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    if (!ENRICH_ENABLED) return;
    if (!process.env.BGG_API_TOKEN) return;
    const targets = await ctx.runQuery(internal.games.dueForEnrich, {
      limit: ENRICH_BATCH,
    });
    for (const [i, t] of targets.entries()) {
      await ctx.scheduler.runAfter(
        i * ENRICH_STAGGER_MS,
        internal.images.enrichSyncedGame,
        { gameId: t.gameId, bggId: t.bggId },
      );
    }
    // A full batch means there may be more — come back once this one has
    // drained (and stamped bggCheckedAt, so those rows drop out of the query).
    if (targets.length === ENRICH_BATCH) {
      await ctx.scheduler.runAfter(
        ENRICH_BATCH * ENRICH_STAGGER_MS + 5000,
        internal.bggSync.enrichStubs,
        {},
      );
    }
  },
});

/**
 * Test helper: create-or-find a game for a single BGG id and enrich it, running
 * the same pipeline a real sync uses (metadata, cover, and — for an expansion —
 * fetching + linking its base game). Lets the expansion logic be exercised on a
 * couple of ids instead of a whole 238-game collection.
 *
 *   npx convex run bggSync:testEnrichByBgg '{"bggId":"266524"}'
 *
 * (266524 = "Wingspan: European Expansion"; its base, Wingspan 266192, is
 * created and linked automatically if absent.)
 */
export const testEnrichByBgg = internalAction({
  args: { bggId: v.string() },
  handler: async (ctx, { bggId }): Promise<{ gameId: Id<"games"> }> => {
    const { gameId } = await ctx.runMutation(internal.games.ensureStubForBgg, {
      bggId,
      title: `BGG ${bggId}`,
    });
    await ctx.runAction(internal.images.enrichSyncedGame, { gameId, bggId });
    return { gameId };
  },
});

/* -------------------------------------------------------------------------- */
/* The fetch loop                                                             */
/* -------------------------------------------------------------------------- */

/** Record a transient failure and re-schedule, or give up past the ceiling. */
async function retryLater(
  ctx: ActionCtx,
  jobId: Id<"bggSyncJobs">,
  reason: string,
  userMessage: string,
): Promise<void> {
  const attempts = await ctx.runMutation(internal.bggSync.markJobWaiting, {
    jobId,
    error: reason,
  });
  if (attempts === null) return; // job deleted mid-run
  if (attempts > MAX_ATTEMPTS) {
    await ctx.runMutation(internal.bggSync.failJob, { jobId, error: userMessage });
    return;
  }
  await ctx.scheduler.runAfter(
    backoffMs(attempts),
    internal.bggSync.runCollection,
    { jobId },
  );
}

export const runCollection = internalAction({
  args: { jobId: v.id("bggSyncJobs") },
  handler: async (ctx, { jobId }): Promise<void> => {
    const job = await ctx.runQuery(internal.bggSync.getJob, { jobId });
    if (!job || job.status === "canceled" || job.status === "done") return;

    const token = process.env.BGG_API_TOKEN;
    if (!token) {
      await ctx.runMutation(internal.bggSync.failJob, {
        jobId,
        error: "BoardGameGeek access isn't configured on the server.",
      });
      return;
    }

    let res;
    try {
      res = await bggGet(
        "/xmlapi2/collection",
        {
          username: job.username,
          stats: 1,
          // Base games only. Expansions need a second request with
          // subtype=boardgameexpansion — deliberately left to a follow-up so
          // this path stays one request per run.
          subtype: "boardgame",
        },
        { token },
      );
    } catch {
      await retryLater(
        ctx,
        jobId,
        "bgg_unreachable",
        "Couldn't reach BoardGameGeek. Try again shortly.",
      );
      return;
    }

    // 202 means "accepted, still building" — and `res.ok` is true for it, which
    // is exactly the trap the older /thing code falls into.
    if (isRetryableStatus(res.status)) {
      await retryLater(
        ctx,
        jobId,
        `http_${res.status}`,
        "BoardGameGeek is still preparing your collection. Try again in a few minutes.",
      );
      return;
    }
    if (res.status >= 400) {
      await ctx.runMutation(internal.bggSync.failJob, {
        jobId,
        error: `BoardGameGeek returned an error (${res.status}).`,
      });
      return;
    }

    const parsed = parseCollectionXml(res.xml);
    if (!parsed.ok) {
      if (parsed.reason === "queued") {
        await retryLater(
          ctx,
          jobId,
          "queued",
          "BoardGameGeek is still preparing your collection. Try again in a few minutes.",
        );
        return;
      }
      await ctx.runMutation(internal.bggSync.failJob, {
        jobId,
        error:
          parsed.reason === "invalid_user"
            ? `BoardGameGeek doesn't recognise the username "${job.username}".`
            : "BoardGameGeek sent a response we couldn't read.",
      });
      return;
    }

    await ctx.runMutation(internal.bggSync.markJobRunning, {
      jobId,
      total: parsed.items.length,
    });
    for (let i = 0; i < parsed.items.length; i += IMPORT_BATCH) {
      await ctx.runMutation(internal.bggSync.upsertCollectionItems, {
        jobId,
        items: parsed.items.slice(i, i + IMPORT_BATCH),
      });
    }
    await ctx.runMutation(internal.bggSync.finishCollection, { jobId });
  },
});

/* -------------------------------------------------------------------------- */
/* Maintenance                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Delete a user's synced rows. Keyed off the raw userId and never reads the
 * user document — account deletion removes that row immediately after calling
 * this, so a lookup would find nothing.
 */
export const purgeUserBggData = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    // Drain the collection first, then plays. Each pass reschedules while it
    // still deleted something, so this terminates only once both are empty.
    const rows = await ctx.db
      .query("bggCollection")
      .withIndex("by_user_and_sort_title", (q) => q.eq("userId", userId))
      .take(SWEEP_BATCH);
    for (const r of rows) await ctx.db.delete("bggCollection", r._id);
    if (rows.length > 0) {
      await ctx.scheduler.runAfter(0, internal.bggSync.purgeUserBggData, {
        userId,
      });
      return;
    }

    const plays = await ctx.db
      .query("bggPlays")
      .withIndex("by_user_and_date", (q) => q.eq("userId", userId))
      .take(SWEEP_BATCH);
    for (const p of plays) await ctx.db.delete("bggPlays", p._id);
    if (plays.length > 0) {
      await ctx.scheduler.runAfter(0, internal.bggSync.purgeUserBggData, {
        userId,
      });
    }
  },
});

/**
 * When an admin sets a game's BGG id, adopt the rows that were pointing at a
 * stub (or at nothing) for that id.
 */
export const relinkGameToBggRows = internalMutation({
  args: { gameId: v.id("games"), bggId: v.string() },
  handler: async (ctx, { gameId, bggId }) => {
    // Bounded by how many users own this game; batch and self-reschedule.
    const rows = await ctx.db
      .query("bggCollection")
      .withIndex("by_bgg_id", (q) => q.eq("bggId", bggId))
      .take(SWEEP_BATCH);

    let changed = 0;
    for (const row of rows) {
      if (row.gameId !== gameId) {
        await ctx.db.patch("bggCollection", row._id, { gameId });
        changed++;
      }
    }
    // Only re-run when we both filled a page and actually changed something —
    // otherwise a full page of already-correct rows would loop forever.
    if (rows.length === SWEEP_BATCH && changed > 0) {
      await ctx.scheduler.runAfter(0, internal.bggSync.relinkGameToBggRows, {
        gameId,
        bggId,
      });
    }
    return { changed };
  },
});

/** Watchdog: a job whose action died leaves the UI spinning forever. */
export const failStalledJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - STALL_MS;
    let failed = 0;
    for (const status of IN_FLIGHT) {
      const jobs = await ctx.db
        .query("bggSyncJobs")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(200);
      for (const job of jobs) {
        if (job.updatedAt < cutoff) {
          await ctx.db.patch("bggSyncJobs", job._id, {
            status: "error",
            error: "The sync stopped responding. Try again.",
            finishedAt: Date.now(),
            updatedAt: Date.now(),
          });
          failed++;
        }
      }
    }
    return { failed };
  },
});

/**
 * One-off diagnostic: how many curated games carry a BGG id. Collection rows
 * can only link to games that have one, so poor coverage caps the match rate
 * no matter how good the sync is. Run with `npx convex run`.
 */
export const auditBggIdCoverage = internalQuery({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db.query("games").take(5000);
    const real = games.filter((g) => !g.isStub);
    return {
      curated: real.length,
      withBggId: real.filter((g) => !!g.bggId).length,
      stubs: games.length - real.length,
    };
  },
});
