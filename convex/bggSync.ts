import { v, ConvexError, type Infer } from "convex/values";
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
import { resolveGameAndExpansions } from "./plays";
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
import { matchesGameFilters, type LibraryTime } from "./lib/gameFilters";
import { chatEnabledBaseIds } from "./games";

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
    for (const j of jobs) {
      await ctx.db.delete("bggSyncJobs", j._id);
      await ctx.scheduler.runAfter(0, internal.bggSync.clearEnrichQueue, {
        jobId: j._id,
        before: Number.MAX_SAFE_INTEGER,
      });
    }

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

type CollectionFlags = Pick<
  Doc<"bggCollection">,
  "own" | "wishlist" | "forTrade" | "prevOwned"
>;
type CollectionTally = {
  all: number;
  owned: number;
  wishlist: number;
  forTrade: number;
  prevOwned: number;
};

/** One row's contribution to the tab counts (all zero when in no list). */
function tallyOf(r: CollectionFlags | null): CollectionTally {
  const inAny = !!r && !!(r.own || r.wishlist || r.forTrade || r.prevOwned);
  return {
    all: inAny ? 1 : 0,
    owned: inAny && r?.own ? 1 : 0,
    wishlist: inAny && r?.wishlist ? 1 : 0,
    forTrade: inAny && r?.forTrade ? 1 : 0,
    prevOwned: inAny && r?.prevOwned ? 1 : 0,
  };
}

/** The old scan — fallback while a user has no `collectionCounts` doc. */
async function scanCollectionCounts(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<CollectionTally> {
  const rows = await ctx.db
    .query("bggCollection")
    .withIndex("by_user_and_sort_title", (q) => q.eq("userId", userId))
    .take(5000);
  const c = { all: 0, owned: 0, wishlist: 0, forTrade: 0, prevOwned: 0 };
  for (const r of rows) {
    const t = tallyOf(r);
    c.all += t.all;
    c.owned += t.owned;
    c.wishlist += t.wishlist;
    c.forTrade += t.forTrade;
    c.prevOwned += t.prevOwned;
  }
  return c;
}

/**
 * Keep a user's `collectionCounts` doc in step with one bggCollection row change.
 * Call it in the SAME mutation as every insert / flag patch / delete of a row:
 * `before` = the row as it was (null on insert), `after` = as it now is (null on
 * delete). Only updates an existing doc — until the backfill creates one,
 * readers use the scan, so a missed call before then can't skew anything.
 */
export async function applyCollectionCountDelta(
  ctx: MutationCtx,
  userId: Id<"users">,
  before: CollectionFlags | null,
  after: CollectionFlags | null,
): Promise<void> {
  const a = tallyOf(before);
  const b = tallyOf(after);
  if (
    a.all === b.all &&
    a.owned === b.owned &&
    a.wishlist === b.wishlist &&
    a.forTrade === b.forTrade &&
    a.prevOwned === b.prevOwned
  ) {
    return;
  }
  const doc = await ctx.db
    .query("collectionCounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!doc) return;
  await ctx.db.patch("collectionCounts", doc._id, {
    all: Math.max(0, doc.all + b.all - a.all),
    owned: Math.max(0, doc.owned + b.owned - a.owned),
    wishlist: Math.max(0, doc.wishlist + b.wishlist - a.wishlist),
    forTrade: Math.max(0, doc.forTrade + b.forTrade - a.forTrade),
    prevOwned: Math.max(0, doc.prevOwned + b.prevOwned - a.prevOwned),
  });
}

/** Two-level counts for the collection tabs: one small doc (scan fallback). */
export const myCollectionCounts = query({
  args: {},
  handler: async (ctx) => {
    const zero = { all: 0, owned: 0, wishlist: 0, forTrade: 0, prevOwned: 0 };
    const user = await getCurrentUser(ctx);
    if (!user) return zero;
    const doc = await ctx.db
      .query("collectionCounts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (doc) {
      return {
        all: doc.all,
        owned: doc.owned,
        wishlist: doc.wishlist,
        forTrade: doc.forTrade,
        prevOwned: doc.prevOwned,
      };
    }
    return await scanCollectionCounts(ctx, user._id);
  },
});

/**
 * Create/refresh every user's `collectionCounts` doc from a scan. Paginates
 * users and self-reschedules. Run ONLY once every bggCollection write path calls
 * `applyCollectionCountDelta` (incl. collection.ts setFlags), or counts drift:
 *   npx convex run bggSync:backfillCollectionCounts '{}'
 */
export const backfillCollectionCounts = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const res = await ctx.db
      .query("users")
      .paginate({ numItems: 20, cursor: cursor ?? null });
    for (const u of res.page) {
      const existing = await ctx.db
        .query("collectionCounts")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .unique();
      const c = await scanCollectionCounts(ctx, u._id);
      if (existing) {
        await ctx.db.patch("collectionCounts", existing._id, c);
      } else {
        // Every user gets a doc (even at zero) so a later first add counts.
        await ctx.db.insert("collectionCounts", { userId: u._id, ...c });
      }
    }
    if (!res.isDone) {
      await ctx.scheduler.runAfter(0, internal.bggSync.backfillCollectionCounts, {
        cursor: res.continueCursor,
      });
    }
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
    case "updated":
      arr.sort(
        (a, b) => num(b.game.contentUpdatedAt) - num(a.game.contentUpdatedAt),
      );
      break;
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

type StatusField = "own" | "wishlist" | "forTrade" | "prevOwned";

/** Read a bounded, alphabetical window of one status's rows (or every list when
 *  `null`), via the per-status index so a sparse status never scans the whole
 *  collection. `.take(cap)` caps reads for a very large list. */
async function readStatusWindow(
  ctx: QueryCtx,
  userId: Id<"users">,
  statusField: StatusField | null,
  cap: number,
): Promise<Doc<"bggCollection">[]> {
  switch (statusField) {
    case "own":
      return ctx.db
        .query("bggCollection")
        .withIndex("by_user_own", (i) => i.eq("userId", userId).eq("own", true))
        .take(cap);
    case "wishlist":
      return ctx.db
        .query("bggCollection")
        .withIndex("by_user_wishlist", (i) =>
          i.eq("userId", userId).eq("wishlist", true),
        )
        .take(cap);
    case "forTrade":
      return ctx.db
        .query("bggCollection")
        .withIndex("by_user_forTrade", (i) =>
          i.eq("userId", userId).eq("forTrade", true),
        )
        .take(cap);
    case "prevOwned":
      return ctx.db
        .query("bggCollection")
        .withIndex("by_user_prevOwned", (i) =>
          i.eq("userId", userId).eq("prevOwned", true),
        )
        .take(cap);
    default:
      // "all": every row (a row only exists while it carries some status).
      return ctx.db
        .query("bggCollection")
        .withIndex("by_user_and_sort_title", (i) => i.eq("userId", userId))
        .take(cap);
  }
}

type PagOpts = Infer<typeof paginationOptsValidator>;

/** Cheap alphabetical pagination of one status (or all lists) via the per-status
 *  index — reads ~one page, joining only the returned rows. */
function paginateStatus(
  ctx: QueryCtx,
  userId: Id<"users">,
  statusField: StatusField | null,
  opts: PagOpts,
) {
  switch (statusField) {
    case "own":
      return ctx.db
        .query("bggCollection")
        .withIndex("by_user_own", (i) => i.eq("userId", userId).eq("own", true))
        .paginate(opts);
    case "wishlist":
      return ctx.db
        .query("bggCollection")
        .withIndex("by_user_wishlist", (i) =>
          i.eq("userId", userId).eq("wishlist", true),
        )
        .paginate(opts);
    case "forTrade":
      return ctx.db
        .query("bggCollection")
        .withIndex("by_user_forTrade", (i) =>
          i.eq("userId", userId).eq("forTrade", true),
        )
        .paginate(opts);
    case "prevOwned":
      return ctx.db
        .query("bggCollection")
        .withIndex("by_user_prevOwned", (i) =>
          i.eq("userId", userId).eq("prevOwned", true),
        )
        .paginate(opts);
    default:
      return ctx.db
        .query("bggCollection")
        .withIndex("by_user_and_sort_title", (i) => i.eq("userId", userId))
        .paginate(opts);
  }
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
    // Library-style filters, applied to THIS list only (see the browse page).
    term: v.optional(v.string()),
    players: v.optional(v.number()),
    time: v.optional(
      v.union(v.literal("quick"), v.literal("standard"), v.literal("epic")),
    ),
    hasExpansions: v.optional(v.boolean()),
    chatOnly: v.optional(v.boolean()),
    categories: v.optional(v.array(v.string())),
    mechanics: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx,
    {
      paginationOpts,
      filter,
      sort,
      term,
      players,
      time,
      hasExpansions,
      chatOnly,
      categories,
      mechanics,
    },
  ) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const FIELD: Record<Exclude<typeof filter, "all" | undefined>, StatusField> =
      {
        owned: "own",
        wishlist: "wishlist",
        forTrade: "forTrade",
        prevOwned: "prevOwned",
      };
    const statusField = filter && filter !== "all" ? FIELD[filter] : null;

    // Game-based filters applied after joining each row to its game (chat-ready
    // needs the ingested set). The search term is handled by the search index,
    // not here, so it's left out of the predicate.
    const gf = {
      players,
      time: time as LibraryTime | undefined,
      hasExpansions,
      categories,
      mechanics,
    };
    // Chat-ready is a per-game flag once backfilled (one stats doc read); only
    // before that do we fall back to the full chat-enabled id set.
    const flagsReady =
      !!chatOnly &&
      (await ctx.db.query("catalogueStats").first())?.chatReadyBackfilledAt !=
        null;
    const chatIds =
      chatOnly && !flagsReady ? await chatEnabledBaseIds(ctx) : null;
    const keep = (game: Doc<"games">) =>
      matchesGameFilters(game, gf) &&
      (!chatOnly ||
        (flagsReady ? game.chatReady === true : !!chatIds?.has(game._id)));

    const searchTerm = (term ?? "").trim();
    const searching = searchTerm.length >= 2;

    // --- Search path: index-backed, scoped to the user + this one status, so it
    //     reads only matching rows and scales to any collection size. ---
    if (searching) {
      const result = await ctx.db
        .query("bggCollection")
        .withSearchIndex("search_collection", (s) => {
          const base = s.search("title", searchTerm).eq("userId", user._id);
          return statusField ? base.eq(statusField, true) : base;
        })
        .paginate(paginationOpts);
      const page = (
        await Promise.all(
          result.page.map(async (row) => {
            if (!row.gameId) return null;
            const game = await ctx.db.get("games", row.gameId);
            if (!game || !keep(game)) return null;
            return await collectionCard(ctx, row, game);
          }),
        )
      ).flatMap((g) => (g ? [g] : []));
      return { ...result, page };
    }

    // Filters / non-alphabetical sort decide whether we can paginate the index
    // cheaply or must scan a bounded window.
    const anyFilter =
      players != null ||
      time != null ||
      !!hasExpansions ||
      !!chatOnly ||
      (categories?.length ?? 0) > 0 ||
      (mechanics?.length ?? 0) > 0;
    const sortKey = sort && isGameSort(sort) && sort !== "title" ? sort : null;

    // --- Cheap path: no filters + alphabetical order → index-backed pagination,
    //     joining only the returned page (the collection rails + default list). ---
    if (!anyFilter && !sortKey) {
      const result = await paginateStatus(
        ctx,
        user._id,
        statusField,
        paginationOpts,
      );
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
    }

    // --- Window path: filters and/or a game-field sort → read a bounded window
    //     of this status's rows (per-status index → never scans the whole
    //     collection), join, filter + sort in JS, then offset-paginate.
    //     Searching narrows beyond the window cap. ---
    const rows = await readStatusWindow(
      ctx,
      user._id,
      statusField,
      COLLECTION_SORT_CAP,
    );
    const paired = (
      await Promise.all(
        rows.map(async (row) => {
          if (!row.gameId) return null;
          const game = await ctx.db.get("games", row.gameId);
          if (!game) return null;
          if (anyFilter && !keep(game)) return null;
          return { row, game };
        }),
      )
    ).flatMap((p) => (p ? [p] : []));
    const sorted = sortKey ? sortCollection(paired, sortKey) : paired;
    const offset = Number(paginationOpts.cursor ?? "0") || 0;
    const end = offset + paginationOpts.numItems;
    const slice = sorted.slice(offset, end);
    const page = await Promise.all(
      slice.map(({ row, game }) => collectionCard(ctx, row, game)),
    );
    return { page, isDone: end >= sorted.length, continueCursor: String(end) };
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
    // Drop any queue rows a canceled/failed earlier run left behind.
    await ctx.scheduler.runAfter(0, internal.bggSync.clearEnrichQueue, {
      jobId,
      before: now,
    });
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
        // Skip the write when nothing BGG-owned changed — a re-sync of an
        // unchanged collection then costs no writes (and no reactive reruns).
        // `syncedAt` alone doesn't count: nothing sweeps on it any more.
        const changed = (Object.keys(base) as (keyof typeof base)[]).some(
          (k) => k !== "syncedAt" && existing[k] !== base[k],
        );
        if (changed) await ctx.db.patch("bggCollection", existing._id, base);
      } else {
        const row = {
          own,
          wishlist: seededWishlist,
          forTrade,
          prevOwned,
        };
        await ctx.db.insert("bggCollection", { ...base, ...row });
        await applyCollectionCountDelta(ctx, job.userId, null, row);
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

    // Enrichment begins by building its queue (buildEnrichQueue) in batches:
    // only stubs still due are queued, so already-filled games never cost a
    // driver step. The queue lives in `bggEnrichQueue`, not on this doc.
    await ctx.db.patch("bggSyncJobs", jobId, {
      status: "enriching",
      enrichQueue: undefined,
      enrichTotal: undefined,
      enrichProcessed: 0,
      currentTitle: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.bggSync.buildEnrichQueue, {
      jobId,
      cursor: null,
      queued: 0,
    });
  },
});

/** How long a failed enrichment attempt backs off before it's retried. */
const ENRICH_RETRY_TTL_MS = 6 * 60 * 60 * 1000;
/** Collection rows examined per queue-building transaction. */
const ENRICH_QUEUE_BATCH = 100;

/** A stub with a BGG id whose last attempt (if any) is past the retry TTL. */
function isEnrichDue(g: Doc<"games">, now: number): g is Doc<"games"> & {
  bggId: string;
} {
  return (
    g.isStub === true &&
    !!g.bggId &&
    now - (g.bggCheckedAt ?? 0) >= ENRICH_RETRY_TTL_MS
  );
}

/**
 * Walk the user's collection in batches, queueing each linked game that still
 * needs enrichment. Self-reschedules; when the walk ends it records the total
 * and starts the driver (or finishes the job when nothing is due).
 */
export const buildEnrichQueue = internalMutation({
  args: {
    jobId: v.id("bggSyncJobs"),
    cursor: v.union(v.string(), v.null()),
    queued: v.number(),
  },
  handler: async (ctx, { jobId, cursor, queued }) => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job || job.status !== "enriching") return;
    const now = Date.now();
    const res = await ctx.db
      .query("bggCollection")
      .withIndex("by_user_and_sort_title", (q) => q.eq("userId", job.userId))
      .paginate({ numItems: ENRICH_QUEUE_BATCH, cursor });
    let total = queued;
    for (const row of res.page) {
      if (!row.gameId) continue;
      const g = await ctx.db.get("games", row.gameId);
      if (!g || !isEnrichDue(g, now)) continue;
      await ctx.db.insert("bggEnrichQueue", {
        jobId,
        runStartedAt: job.runStartedAt,
        gameId: g._id,
      });
      total++;
    }
    if (!res.isDone) {
      await ctx.db.patch("bggSyncJobs", jobId, { updatedAt: now }); // heartbeat
      await ctx.scheduler.runAfter(0, internal.bggSync.buildEnrichQueue, {
        jobId,
        cursor: res.continueCursor,
        queued: total,
      });
      return;
    }
    if (total === 0) {
      await ctx.db.patch("bggSyncJobs", jobId, {
        status: "done",
        finishedAt: now,
        updatedAt: now,
      });
      return;
    }
    await ctx.db.patch("bggSyncJobs", jobId, {
      enrichTotal: total,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.bggSync.runJobEnrichment, { jobId });
  },
});

/**
 * One driver step, in one transaction: pop the next queued game, advance the
 * counter, narrate its title, and say whether it still needs a BGG call (another
 * user's sync may have filled it meanwhile). Finishes the job when the queue is
 * empty. Jobs that were mid-enrichment at deploy still carry the legacy
 * `enrichQueue` array on the doc and are drained from it instead.
 */
export const claimNextEnrich = internalMutation({
  args: { jobId: v.id("bggSyncJobs") },
  handler: async (
    ctx,
    { jobId },
  ): Promise<
    | { kind: "stop" }
    | { kind: "skip" }
    | { kind: "enrich"; gameId: Id<"games">; bggId: string }
  > => {
    const job = await ctx.db.get("bggSyncJobs", jobId);
    if (!job || job.status !== "enriching") return { kind: "stop" };
    const now = Date.now();

    let gameId: Id<"games"> | null = null;
    if (job.enrichQueue) {
      const idx = job.enrichProcessed ?? 0;
      gameId = idx < job.enrichQueue.length ? job.enrichQueue[idx] : null;
    } else {
      const next = await ctx.db
        .query("bggEnrichQueue")
        .withIndex("by_job_and_run", (q) =>
          q.eq("jobId", jobId).eq("runStartedAt", job.runStartedAt),
        )
        .first();
      if (next) {
        gameId = next.gameId;
        await ctx.db.delete("bggEnrichQueue", next._id);
      }
    }

    if (!gameId) {
      await ctx.db.patch("bggSyncJobs", jobId, {
        status: "done",
        enrichQueue: undefined,
        currentTitle: undefined,
        finishedAt: now,
        updatedAt: now,
      });
      return { kind: "stop" };
    }

    const g = await ctx.db.get("games", gameId);
    const due = !!g && isEnrichDue(g, now);
    // Advance first — a bad entry is skipped, never re-looped.
    await ctx.db.patch("bggSyncJobs", jobId, {
      enrichProcessed: (job.enrichProcessed ?? 0) + 1,
      ...(due && g ? { currentTitle: g.title } : {}),
      updatedAt: now,
    });
    return due && g && g.bggId
      ? { kind: "enrich", gameId, bggId: g.bggId }
      : { kind: "skip" };
  },
});

/**
 * Enrichment driver: one queued game per step (see claimNextEnrich). Due stubs
 * are enriched (BGG /thing + cover, staggered); anything filled meanwhile is
 * skipped instantly. The cursor advances before the BGG call and the call is
 * wrapped, so a single failure can never break the reschedule chain — the run
 * always drains to done. Enriching an expansion also pulls in + fills its base
 * game (see images.enrichSyncedGame).
 */
export const runJobEnrichment = internalAction({
  args: { jobId: v.id("bggSyncJobs") },
  handler: async (ctx, { jobId }): Promise<void> => {
    const step = await ctx.runMutation(internal.bggSync.claimNextEnrich, {
      jobId,
    });
    if (step.kind === "stop") return; // canceled / gone / done

    if (step.kind === "enrich") {
      try {
        await ctx.runAction(internal.images.enrichSyncedGame, {
          gameId: step.gameId,
          bggId: step.bggId,
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
      await ctx.scheduler.runAfter(0, internal.bggSync.runJobEnrichment, {
        jobId,
      });
    }
  },
});

/**
 * Delete a job's queue rows from runs older than `before` (a canceled / failed
 * run's leftovers, or every row once the job itself is gone). Batched.
 */
export const clearEnrichQueue = internalMutation({
  args: { jobId: v.id("bggSyncJobs"), before: v.number() },
  handler: async (ctx, { jobId, before }) => {
    const rows = await ctx.db
      .query("bggEnrichQueue")
      .withIndex("by_job_and_run", (q) =>
        q.eq("jobId", jobId).lt("runStartedAt", before),
      )
      .take(SWEEP_BATCH);
    for (const r of rows) await ctx.db.delete("bggEnrichQueue", r._id);
    if (rows.length === SWEEP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.bggSync.clearEnrichQueue, {
        jobId,
        before,
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

/** Structural equality for stored values (undefined ≡ missing, key order free). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((x, i) => sameValue(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    for (const k of keys) if (!sameValue(ao[k], bo[k])) return false;
    return true;
  }
  return false;
}

/** Would patching `body` onto `existing` change anything but `updatedAt`? */
function playBodyMatches(
  existing: Doc<"plays">,
  body: Record<string, unknown>,
): boolean {
  const e = existing as unknown as Record<string, unknown>;
  return Object.keys(body).every(
    (k) => k === "updatedAt" || sameValue(e[k], body[k]),
  );
}

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
      // An expansion is never the logged game: BGG happily records a play
      // against one, so fold it into its base game and note the expansion.
      const subject = await resolveGameAndExpansions(ctx, {
        gameId,
        bggId: play.bggId,
        title: play.title,
      });

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
        gameId: subject.gameId,
        bggId: subject.bggId,
        title: subject.title || play.title,
        expansions: subject.expansions,
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
        // Skip unchanged plays: an incremental re-sync re-fetches the newest
        // page, and a full one every play — most of which haven't changed.
        if (existing.source === "bgg" && !playBodyMatches(existing, body)) {
          await ctx.db.patch("plays", existing._id, body);
        }
      } else {
        const playId = await ctx.db.insert("plays", { ...body, createdAt: now });
        await ctx.db.insert("playParticipants", {
          playId,
          ownerId: job.userId,
          gameId: subject.gameId,
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
      // The true total without re-reading every play: a full sync walked all of
      // the user's BGG plays (`processed`); an incremental one adds this run's
      // newly created plays to the previous total. (A BGG play deleted in-app
      // isn't subtracted — this is the "imported from BGG" figure.)
      const playsCount =
        job.mode === "full" || account.playsCount == null
          ? Math.max(job.processed, job.created ?? 0)
          : account.playsCount + (job.created ?? 0);
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
    // Collection empty — zero its counts doc to match.
    const counts = await ctx.db
      .query("collectionCounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (counts && counts.all > 0) {
      await ctx.db.patch("collectionCounts", counts._id, {
        all: 0,
        owned: 0,
        wishlist: 0,
        forTrade: 0,
        prevOwned: 0,
      });
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
