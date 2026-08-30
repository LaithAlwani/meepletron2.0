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
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
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
import {
  parseCollectionXml,
  parsePlaysXml,
  type BggCollectionItem,
} from "./lib/bggXml";
import {
  bggCollectionItemValidator,
  bggPlayItemValidator,
} from "./lib/bggSyncTypes";
import { slugifyUnique } from "./lib/slug";
import { sortKeys, isGameSort, type GameSortKey } from "./lib/gameSort";
import { coverUrls } from "./lib/gameCover";

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

/** Two-level counts for the collection tabs. Scans the user's rows (bounded). */
export const myCollectionCounts = query({
  args: {},
  handler: async (ctx) => {
    const zero = { all: 0, owned: 0, wishlist: 0, forTrade: 0, prevOwned: 0 };
    const user = await getCurrentUser(ctx);
    if (!user) return zero;
    const rows = await ctx.db
      .query("bggCollection")
      .withIndex("by_user_and_sort_title", (q) => q.eq("userId", user._id))
      .take(5000);
    const c = { ...zero };
    for (const r of rows) {
      const inAny = r.own || r.wishlist || r.forTrade || r.prevOwned;
      if (!inAny) continue;
      c.all++;
      if (r.own) c.owned++;
      if (r.wishlist) c.wishlist++;
      if (r.forTrade) c.forTrade++;
      if (r.prevOwned) c.prevOwned++;
    }
    return c;
  },
});

/** How many collection rows the sorted path considers (bounded, surfaced). */
const COLLECTION_SORT_CAP = 1500;

/** A library-style card for a collection row + its linked game. */
async function collectionCard(
  ctx: QueryCtx,
  row: Doc<"bggCollection">,
  game: Doc<"games">,
) {
  // Prefer the row's BGG CDN URLs (zero egress); fall back to the game's cover
  // (its own BGG URL, else the stored Convex blob).
  const { imageUrl, thumbnailUrl } = await coverUrls(ctx, game);
  return {
    ...game,
    imageUrl: row.imageUrl ?? imageUrl,
    thumbnailUrl: row.thumbnailUrl ?? thumbnailUrl,
  };
}

/** Sort (row, game) pairs by a chosen game-field sort. */
function sortCollection<T extends { game: Doc<"games"> }>(
  pairs: T[],
  sort: GameSortKey,
): T[] {
  const num = (v?: number) => v ?? -Infinity;
  const arr = [...pairs];
  switch (sort) {
    case "year":
      arr.sort((a, b) => num(b.game.yearNum) - num(a.game.yearNum));
      break;
    case "weight":
      arr.sort((a, b) => num(b.game.bggWeight) - num(a.game.bggWeight));
      break;
    case "rated":
      arr.sort((a, b) => num(b.game.bggRatingCount) - num(a.game.bggRatingCount));
      break;
    case "newest":
      arr.sort((a, b) => b.game._creationTime - a.game._creationTime);
      break;
    case "rating":
    default:
      arr.sort((a, b) => num(b.game.bggRating) - num(a.game.bggRating));
      break;
  }
  return arr;
}

export const myCollection = query({
  args: {
    paginationOpts: paginationOptsValidator,
    // One of the four collection lists, or `all` (any of the four).
    filter: v.optional(
      v.union(
        v.literal("all"),
        v.literal("owned"),
        v.literal("wishlist"),
        v.literal("forTrade"),
        v.literal("prevOwned"),
      ),
    ),
    sort: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, filter, sort }) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const FIELD = {
      owned: "own",
      wishlist: "wishlist",
      forTrade: "forTrade",
      prevOwned: "prevOwned",
    } as const;

    // `all` = in at least one of the four lists; otherwise the one chosen list.
    // Inlined at each call site so Convex infers the filter-builder type.
    // Sorted path: any game-field sort. `title` stays on the cheap cursor path
    // below (the index is already alphabetical). Load a bounded window of rows,
    // join their games (which carry the denormalized sort keys), sort, and
    // offset-paginate — the collection is bounded at a couple of thousand rows.
    const sortKey =
      sort && isGameSort(sort) && sort !== "title" ? sort : null;
    if (sortKey) {
      const rows = await ctx.db
        .query("bggCollection")
        .withIndex("by_user_and_sort_title", (qq) => qq.eq("userId", user._id))
        .filter((qq) =>
          filter && filter !== "all"
            ? qq.eq(qq.field(FIELD[filter]), true)
            : qq.or(
                qq.eq(qq.field("own"), true),
                qq.eq(qq.field("wishlist"), true),
                qq.eq(qq.field("forTrade"), true),
                qq.eq(qq.field("prevOwned"), true),
              ),
        )
        .take(COLLECTION_SORT_CAP);
      const paired = (
        await Promise.all(
          rows.map(async (row) => {
            const game = row.gameId
              ? await ctx.db.get("games", row.gameId)
              : null;
            return game ? { row, game } : null;
          }),
        )
      ).flatMap((p) => (p ? [p] : []));
      const sorted = sortCollection(paired, sortKey);
      const offset = Number(paginationOpts.cursor ?? "0") || 0;
      const end = offset + paginationOpts.numItems;
      const slice = sorted.slice(offset, end);
      const page = await Promise.all(
        slice.map(({ row, game }) => collectionCard(ctx, row, game)),
      );
      return {
        page,
        isDone: end >= sorted.length,
        continueCursor: String(end),
      };
    }

    // `.filter` doesn't reduce rows read, but a single user's collection is
    // bounded at a couple of thousand rows, so the scan stays cheap.
    const result = await ctx.db
      .query("bggCollection")
      .withIndex("by_user_and_sort_title", (qq) => qq.eq("userId", user._id))
      .filter((qq) =>
        filter && filter !== "all"
          ? qq.eq(qq.field(FIELD[filter]), true)
          : qq.or(
              qq.eq(qq.field("own"), true),
              qq.eq(qq.field("wishlist"), true),
              qq.eq(qq.field("forTrade"), true),
              qq.eq(qq.field("prevOwned"), true),
            ),
      )
      .paginate(paginationOpts);
    // The collection renders library-style GameCards, so return the linked game
    // + media. Rows whose game was deleted are dropped (nothing to card).
    const page = (
      await Promise.all(
        result.page.map(async (row) => {
          if (!row.gameId) return null;
          const game = await ctx.db.get("games", row.gameId);
          if (!game) return null;
          return await collectionCard(ctx, row, game);
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
    minDate?: string;
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
    minDate: args.minDate,
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
  let jobId: Id<"bggSyncJobs">;
  if (existing) {
    await ctx.db.patch("bggSyncJobs", existing._id, fields);
    jobId = existing._id;
  } else {
    jobId = await ctx.db.insert("bggSyncJobs", fields);
  }
  // Per-job stall watchdog (replaces the every-15-min sweep): re-checks this
  // job once the stall window elapses and fails it if it never progressed.
  await ctx.scheduler.runAfter(STALL_MS, internal.bggSync.watchStalledJob, {
    jobId,
  });
  return jobId;
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
/* Plays sync kickoff                                                         */
/* -------------------------------------------------------------------------- */

/** Reset the plays job and schedule the first page. */
async function startPlaysSync(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Id<"bggSyncJobs"> | null> {
  const account = await ctx.db
    .query("bggAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!account) return null;
  // After the first full import, only fetch plays on/after the high-water mark.
  const minDate = account.playsSyncedThrough;
  const jobId = await resetJob(ctx, {
    userId,
    accountId: account._id,
    username: account.username,
    kind: "plays",
    mode: minDate ? "incremental" : "full",
    minDate: minDate ?? undefined,
  });
  await ctx.scheduler.runAfter(0, internal.bggSync.runPlays, { jobId });
  return jobId;
}

export const beginPlaysSync = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => await startPlaysSync(ctx, userId),
});

/** User-triggered plays import (same cooldown + in-flight lock as collection). */
export const syncPlaysNow = mutation({
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
        q.eq("userId", user._id).eq("kind", "plays"),
      )
      .unique();
    if (job && isInFlight(job.status)) {
      throw new ConvexError("A plays sync is already running.");
    }
    if (
      account.playsSyncedAt &&
      Date.now() - account.playsSyncedAt < MIN_SYNC_INTERVAL_MS
    ) {
      throw new ConvexError(
        "Your plays were synced in the last 15 minutes — try again a bit later.",
      );
    }
    await startPlaysSync(ctx, user._id);
  },
});

export const cancelPlaysSync = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const job = await ctx.db
      .query("bggSyncJobs")
      .withIndex("by_user_and_kind", (q) =>
        q.eq("userId", user._id).eq("kind", "plays"),
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
  args: {
    jobId: v.id("bggSyncJobs"),
    total: v.optional(v.number()),
    totalPages: v.optional(v.number()),
  },
  handler: async (ctx, { jobId, total, totalPages }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job) return;
    await ctx.db.patch("bggSyncJobs", jobId, {
      status: "running",
      attempts: 0,
      ...(total !== undefined ? { total } : {}),
      ...(totalPages !== undefined ? { totalPages } : {}),
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
    ...sortKeys({ title: item.title, year: item.year }),
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
      // The four collection flags are the user's to edit after the first import —
      // never let a re-sync clobber them. So they're stripped from the metadata
      // patch; a brand-new row is seeded with the BGG status, folding
      // want / want-to-buy / preordered into wishlist.
      const { own, wishlist, forTrade, prevOwned, ...meta } = item;
      const seededWishlist =
        wishlist ||
        item.want ||
        item.wantToBuy ||
        item.preordered ||
        undefined;
      const inAnyList = own || seededWishlist || forTrade || prevOwned;

      const existing = await ctx.db
        .query("bggCollection")
        .withIndex("by_user_and_bgg_id", (q) =>
          q.eq("userId", job.userId).eq("bggId", item.bggId),
        )
        .unique();

      // A brand-new item that's in none of the four lists (e.g. only "want to
      // play") isn't part of the collection — skip it entirely.
      if (!existing && !inAnyList) continue;

      const { gameId, created } = await linkOrCreateGame(ctx, item);
      if (created) createdCount++;
      titles.push(item.title);
      const base = {
        ...meta,
        userId: job.userId,
        gameId,
        sortTitle: item.title.toLowerCase(),
        syncedAt: job.runStartedAt,
      };
      if (existing) {
        await ctx.db.patch("bggCollection", existing._id, base);
      } else {
        await ctx.db.insert("bggCollection", {
          ...base,
          own,
          wishlist: seededWishlist,
          forTrade,
          prevOwned,
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
/* Plays import                                                               */
/* -------------------------------------------------------------------------- */

const PLAYS_PER_PAGE = 100; // BGG's fixed /plays page size

/**
 * Resolve/create the local game for a play (stub if we don't curate it). Lookup
 * + insert stay in one mutation so Convex OCC dedupes concurrent syncs, exactly
 * like `linkOrCreateGame`.
 */
async function linkPlayGame(
  ctx: MutationCtx,
  bggId: string,
  title: string,
): Promise<Id<"games">> {
  const existing = await ctx.db
    .query("games")
    .withIndex("by_bgg_id", (q) => q.eq("bggId", bggId))
    .first();
  if (existing) return existing._id;
  return await ctx.db.insert("games", {
    title,
    slug: await slugifyUnique(ctx, title),
    isExpansion: false,
    isStub: true,
    bggId,
    designers: [],
    artists: [],
    publishers: [],
    categories: [],
    gameMechanics: [],
    ...sortKeys({ title }),
  });
}

export const setPlaysPage = internalMutation({
  args: { jobId: v.id("bggSyncJobs"), page: v.number() },
  handler: async (ctx, { jobId, page }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job) return;
    await ctx.db.patch("bggSyncJobs", jobId, { page, updatedAt: Date.now() });
  },
});

/** Newest play date (BGG returns most-recent first) → incremental high-water. */
export const stampPlaysHighWater = internalMutation({
  args: { jobId: v.id("bggSyncJobs"), date: v.string() },
  handler: async (ctx, { jobId, date }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job) return;
    await ctx.db.patch("bggAccounts", job.accountId, {
      playsSyncedThrough: date,
    });
  },
});

/**
 * Map a page of parsed BGG plays into the unified `plays` table. Idempotent via
 * `by_bgg_play_id`; a re-sync only overwrites BGG-owned rows, never a play the
 * user has since edited/made public. Format is inferred (see the plan) and the
 * row is flagged `needsReview` so the UI can offer "confirm format".
 */
export const upsertPlays = internalMutation({
  args: { jobId: v.id("bggSyncJobs"), plays: v.array(bggPlayItemValidator) },
  handler: async (ctx, { jobId, plays }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job || job.status === "canceled") return;
    const meUsername = job.username.toLowerCase();

    let created = 0;
    const titles: string[] = [];
    for (const play of plays) {
      const gameId = await linkPlayGame(ctx, play.bggId, play.title);

      const players = (play.players ?? []).map((p) => {
        const scoreNum = p.score != null ? Number(p.score) : NaN;
        const isMe = !!p.username && p.username.toLowerCase() === meUsername;
        return {
          name: p.name || (isMe ? "You" : "Player"),
          userId: isMe ? job.userId : undefined,
          score: Number.isFinite(scoreNum) ? scoreNum : undefined,
          isWinner: p.win,
          color: p.color,
          isNew: p.isNew,
        };
      });

      // Format inference: everyone shares one win value ⇒ cooperative; else
      // competitive (points if any numeric score, otherwise placement).
      const winVals = players.map((p) => p.isWinner);
      const allSame =
        winVals.length > 0 && winVals.every((w) => w === winVals[0]);
      const anyScore = players.some((p) => p.score != null);
      let format: "cooperative" | "competitive" = "competitive";
      let coopOutcome: "win" | "loss" | undefined;
      let scoreMode: "highest" | "placement" | undefined = anyScore
        ? "highest"
        : "placement";
      if (allSame && winVals[0] !== undefined) {
        format = "cooperative";
        coopOutcome = winVals[0] ? "win" : "loss";
        scoreMode = undefined;
      }

      const existing = await ctx.db
        .query("plays")
        .withIndex("by_bgg_play_id", (q) => q.eq("bggPlayId", play.playId))
        .first();

      const now = Date.now();
      const body = {
        userId: job.userId,
        gameId,
        bggId: play.bggId,
        title: play.title,
        date: play.date,
        lengthMinutes: play.lengthMinutes,
        location: play.location,
        comments: play.comments,
        format,
        scoreMode,
        coopOutcome,
        players,
        visibility: "private" as const,
        source: "bgg" as const,
        bggPlayId: play.playId,
        needsReview: true,
        updatedAt: now,
      };

      if (existing) {
        if (existing.source === "bgg") {
          await ctx.db.patch("plays", existing._id, body);
        }
      } else {
        const playId = await ctx.db.insert("plays", { ...body, createdAt: now });
        await ctx.db.insert("playParticipants", {
          playId,
          ownerId: job.userId,
          gameId,
          date: play.date,
          visibility: "private",
          userId: job.userId,
        });
        created++;
      }
      titles.push(play.title);
    }

    await ctx.db.patch("bggSyncJobs", jobId, {
      processed: job.processed + plays.length,
      created: (job.created ?? 0) + created,
      recentTitles: [...(job.recentTitles ?? []), ...titles].slice(-8),
      updatedAt: Date.now(),
    });
  },
});

export const finishPlays = internalMutation({
  args: { jobId: v.id("bggSyncJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job || job.status === "canceled") return;
    const now = Date.now();
    const account = await ctx.db.get("bggAccounts", job.accountId);
    if (account) {
      // The true total (not just this run's page count — incremental syncs only
      // process the newest plays).
      const owned = await ctx.db
        .query("plays")
        .withIndex("by_user_and_date", (q) => q.eq("userId", job.userId))
        .take(5000);
      const playsCount = owned.filter((p) => p.source === "bgg").length;
      await ctx.db.patch("bggAccounts", job.accountId, {
        playsSyncedAt: now,
        playsCount,
      });
    }
    await ctx.db.patch("bggSyncJobs", jobId, {
      status: "done",
      finishedAt: now,
      updatedAt: now,
    });
  },
});

/** Record a transient plays-fetch failure and re-schedule, or give up. */
async function retryPlaysLater(
  ctx: ActionCtx,
  jobId: Id<"bggSyncJobs">,
  reason: string,
  userMessage: string,
): Promise<void> {
  const attempts = await ctx.runMutation(internal.bggSync.markJobWaiting, {
    jobId,
    error: reason,
  });
  if (attempts === null) return;
  if (attempts > MAX_ATTEMPTS) {
    await ctx.runMutation(internal.bggSync.failJob, { jobId, error: userMessage });
    return;
  }
  await ctx.scheduler.runAfter(backoffMs(attempts), internal.bggSync.runPlays, {
    jobId,
  });
}

export const runPlays = internalAction({
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
        "/xmlapi2/plays",
        { username: job.username, page: job.page, mindate: job.minDate },
        { token },
      );
    } catch {
      await retryPlaysLater(
        ctx,
        jobId,
        "bgg_unreachable",
        "Couldn't reach BoardGameGeek. Try again shortly.",
      );
      return;
    }
    if (isRetryableStatus(res.status)) {
      await retryPlaysLater(
        ctx,
        jobId,
        `http_${res.status}`,
        "BoardGameGeek is still preparing your plays. Try again in a few minutes.",
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

    const parsed = parsePlaysXml(res.xml);
    if (!parsed.ok) {
      if (parsed.reason === "queued") {
        await retryPlaysLater(
          ctx,
          jobId,
          "queued",
          "BoardGameGeek is still preparing your plays. Try again in a few minutes.",
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

    const totalPages = Math.max(1, Math.ceil(parsed.total / PLAYS_PER_PAGE));
    if (job.page <= 1) {
      await ctx.runMutation(internal.bggSync.markJobRunning, {
        jobId,
        total: parsed.total,
        totalPages,
      });
      if (parsed.plays[0]?.date) {
        await ctx.runMutation(internal.bggSync.stampPlaysHighWater, {
          jobId,
          date: parsed.plays[0].date,
        });
      }
    }
    await ctx.runMutation(internal.bggSync.upsertPlays, {
      jobId,
      plays: parsed.plays,
    });

    if (job.page < totalPages && parsed.plays.length > 0) {
      await ctx.runMutation(internal.bggSync.setPlaysPage, {
        jobId,
        page: job.page + 1,
      });
      await ctx.scheduler.runAfter(0, internal.bggSync.runPlays, { jobId });
    } else {
      await ctx.runMutation(internal.bggSync.finishPlays, { jobId });
    }
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

    // Only BGG-imported plays are purged; hand-logged plays are the user's own.
    const plays = await ctx.db
      .query("plays")
      .withIndex("by_user_and_date", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("source"), "bgg"))
      .take(SWEEP_BATCH);
    for (const p of plays) {
      const parts = await ctx.db
        .query("playParticipants")
        .withIndex("by_play", (q) => q.eq("playId", p._id))
        .collect();
      for (const pt of parts) await ctx.db.delete("playParticipants", pt._id);
      await ctx.db.delete("plays", p._id);
    }
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

/**
 * Per-job stall watchdog — scheduled when a sync job is created (see
 * `createOrResetJob`). Fires once the stall window elapses: if the job is still
 * in flight and hasn't progressed for STALL_MS, it's failed so the UI stops
 * spinning; if it's still making progress, the watchdog re-arms for the
 * remaining window. Replaces the old every-15-min `failStalledJobs` sweep, so
 * the check runs only while a sync is actually happening.
 */
export const watchStalledJob = internalMutation({
  args: { jobId: v.id("bggSyncJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job) return;
    // Terminal (done / error / canceled) — nothing left to watch.
    if (!(IN_FLIGHT as readonly string[]).includes(job.status)) return;
    const now = Date.now();
    if (job.updatedAt < now - STALL_MS) {
      await ctx.db.patch("bggSyncJobs", jobId, {
        status: "error",
        error: "The sync stopped responding. Try again.",
        finishedAt: now,
        updatedAt: now,
      });
      return;
    }
    // Still progressing — re-check after the remaining stall window.
    await ctx.scheduler.runAfter(
      Math.max(job.updatedAt + STALL_MS - now, 1000),
      internal.bggSync.watchStalledJob,
      { jobId },
    );
  },
});

/**
 * Manual backstop for the per-job watchdog (kept for `npx convex run`): fails
 * any in-flight job that's been idle past STALL_MS. Not scheduled by a cron.
 */
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
