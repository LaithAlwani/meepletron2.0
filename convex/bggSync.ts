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
    filter: v.optional(
      v.union(v.literal("owned"), v.literal("wishlist"), v.literal("all")),
    ),
  },
  handler: async (ctx, { paginationOpts, filter }) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    let q = ctx.db
      .query("bggCollection")
      .withIndex("by_user_and_sort_title", (qq) => qq.eq("userId", user._id));
    // `.filter` doesn't reduce rows read, but a single user's collection is
    // bounded at a couple of thousand rows, so the scan stays cheap.
    if (filter === "owned") {
      q = q.filter((qq) => qq.eq(qq.field("own"), true));
    } else if (filter === "wishlist") {
      q = q.filter((qq) => qq.eq(qq.field("wishlist"), true));
    }

    const result = await q.paginate(paginationOpts);
    const page = await Promise.all(
      result.page.map(async (row) => {
        // Null-check: a game can be deleted out from under a linked row, and
        // the denormalized title is exactly the fallback for that.
        const game = row.gameId
          ? await ctx.db.get("games", row.gameId)
          : null;
        const curated = !!game && !game.isStub;
        return {
          _id: row._id,
          bggId: row.bggId,
          title: row.title,
          year: row.year,
          thumbnailUrl: row.thumbnailUrl,
          own: row.own,
          wishlist: row.wishlist,
          userRating: row.userRating,
          numPlays: row.numPlays,
          isExpansion: row.isExpansion,
          // Only curated games are worth linking to — a stub's page has no
          // rulebook, no chat, nothing to show.
          slug: curated ? game.slug : null,
          chatReady: curated ? !!game.chatReady : false,
        };
      }),
    );
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
const IN_FLIGHT = ["queued", "waiting", "running", "sweeping"] as const;

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
  args: { jobId: v.id("bggSyncJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job) return;
    await ctx.db.patch("bggSyncJobs", jobId, {
      status: "running",
      attempts: 0,
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
): Promise<Id<"games">> {
  const existing = await ctx.db
    .query("games")
    .withIndex("by_bgg_id", (q) => q.eq("bggId", item.bggId))
    .first();
  if (existing) return existing._id;

  return await ctx.db.insert("games", {
    title: item.title,
    slug: await slugifyUnique(ctx, item.title),
    isExpansion: item.isExpansion,
    isStub: true,
    chatReady: false,
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

    for (const item of items) {
      const gameId = await linkOrCreateGame(ctx, item);
      const row = {
        ...item,
        userId: job.userId,
        gameId,
        sortTitle: item.title.toLowerCase(),
        syncedAt: job.runStartedAt,
      };
      const existing = await ctx.db
        .query("bggCollection")
        .withIndex("by_user_and_bgg_id", (q) =>
          q.eq("userId", job.userId).eq("bggId", item.bggId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch("bggCollection", existing._id, row);
      } else {
        await ctx.db.insert("bggCollection", row);
      }
    }

    await ctx.db.patch("bggSyncJobs", jobId, {
      processed: job.processed + items.length,
      updatedAt: Date.now(),
    });
  },
});

export const finishCollection = internalMutation({
  args: { jobId: v.id("bggSyncJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job || job.status === "canceled") return;
    await ctx.db.patch("bggSyncJobs", jobId, {
      status: "sweeping",
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.bggSync.sweepCollection, { jobId });
  },
});

/**
 * Delete rows this run didn't touch — i.e. games the user no longer has in
 * their BGG collection. Batched and self-rescheduling, so a large removal
 * doesn't blow the transaction limits.
 */
export const sweepCollection = internalMutation({
  args: { jobId: v.id("bggSyncJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job || job.status === "canceled") return;

    const stale = await ctx.db
      .query("bggCollection")
      .withIndex("by_user_and_synced_at", (q) =>
        q.eq("userId", job.userId).lt("syncedAt", job.runStartedAt),
      )
      .take(SWEEP_BATCH);
    for (const row of stale) await ctx.db.delete("bggCollection", row._id);

    if (stale.length === SWEEP_BATCH) {
      await ctx.db.patch("bggSyncJobs", jobId, { updatedAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.bggSync.sweepCollection, { jobId });
      return;
    }

    const now = Date.now();
    await ctx.db.patch("bggSyncJobs", jobId, {
      status: "done",
      finishedAt: now,
      updatedAt: now,
    });
    const account = await ctx.db.get("bggAccounts", job.accountId);
    if (account) {
      await ctx.db.patch("bggAccounts", job.accountId, {
        collectionSyncedAt: now,
        collectionCount: job.processed,
      });
    }
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

    await ctx.runMutation(internal.bggSync.markJobRunning, { jobId });
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
