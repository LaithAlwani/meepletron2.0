import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { annotationValidator } from "./lib/annotations";
import { bggStatsValidator } from "./lib/bggStats";
import {
  bggAccountStatusValidator,
  bggCollectionRowValidator,
  bggSyncKindValidator,
  bggSyncStatusValidator,
} from "./lib/bggSyncTypes";
import {
  playRowValidator,
  playPersonValidator,
  playParticipantValidator,
} from "./lib/playTypes";
import {
  postRowValidator,
  postReactionValidator,
  postCommentValidator,
  postCommentReactionValidator,
  notificationValidator,
} from "./lib/postTypes";

/**
 * Meepletron 2.0 data model — everything lives in Convex.
 *
 * Auth: Convex Auth owns `authSessions`/`authAccounts`/... via `authTables`.
 * We extend its `users` table (rather than a parallel table) with app fields.
 */
export default defineSchema({
  ...authTables,

  // Convex Auth's `users` table, extended with our app fields. Keep the auth
  // fields + indexes exactly as `authTables.users` defines them.
  users: defineTable({
    // --- fields owned by Convex Auth ---
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // --- our app fields ---
    role: v.optional(v.union(v.literal("user"), v.literal("admin"))),
    // Public handle (unique, lowercased key). Shown on the profile; used more
    // widely in later stages.
    username: v.optional(v.string()),
    usernameLower: v.optional(v.string()),
    // Uploaded avatar in Convex storage; falls back to the OAuth `image` URL.
    avatarStorageId: v.optional(v.id("_storage")),
    // The last ≤5 avatars the user uploaded (most-recent first) for quick reuse.
    // A 6th upload evicts + deletes the oldest.
    avatarHistory: v.optional(v.array(v.id("_storage"))),
    // What the user chooses to expose on their public /user/<username> page.
    // All optional; read with defaults (name/avatar/top-lists on, collection off).
    publicProfile: v.optional(
      v.object({
        showName: v.optional(v.boolean()),
        showAvatar: v.optional(v.boolean()),
        showTopLists: v.optional(v.boolean()),
        showOwned: v.optional(v.boolean()),
        showForTrade: v.optional(v.boolean()),
        showWishlist: v.optional(v.boolean()),
        showPlays: v.optional(v.boolean()),
      }),
    ),
    tokensUsedToday: v.optional(v.number()),
    tokensResetAt: v.optional(v.number()), // ms timestamp of the current budget window's start
    // Guest→account upgrade: a short-lived claim token set while anonymous, then
    // redeemed after signing up to migrate the guest's data to the new account.
    upgradeToken: v.optional(v.string()),
    upgradeTokenExpiresAt: v.optional(v.number()),
    // Per-user display / behavior preferences (all optional; defaults applied
    // on read in lib/usePreferences).
    preferences: v.optional(
      v.object({
        fontSize: v.optional(
          v.union(
            v.literal("sm"),
            v.literal("base"),
            v.literal("lg"),
            v.literal("xl"),
          ),
        ),
        reduceMotion: v.optional(v.boolean()),
        compact: v.optional(v.boolean()),
        enterToSend: v.optional(v.boolean()),
        showSources: v.optional(v.boolean()),
        emailUpdates: v.optional(v.boolean()),
      }),
    ),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_upgrade_token", ["upgradeToken"])
    .index("by_username_lower", ["usernameLower"]),

  // Board games + expansions unified. `isExpansion` + `parentId` discriminate.
  games: defineTable({
    title: v.string(),
    slug: v.string(),
    isExpansion: v.boolean(),
    parentId: v.optional(v.id("games")),
    // media — Convex storage ids (served via ctx.storage.getUrl)
    imageId: v.optional(v.id("_storage")),
    thumbnailId: v.optional(v.id("_storage")),
    // metadata (entered manually in the admin form)
    year: v.optional(v.string()),
    minPlayers: v.optional(v.number()),
    maxPlayers: v.optional(v.number()),
    minAge: v.optional(v.string()),
    minPlayTime: v.optional(v.number()),
    maxPlayTime: v.optional(v.number()),
    description: v.optional(v.string()),
    designers: v.array(v.string()),
    artists: v.array(v.string()),
    publishers: v.array(v.string()),
    categories: v.array(v.string()),
    gameMechanics: v.array(v.string()),
    // Denormalized "title + designers + publishers + categories + mechanics"
    // for fuzzy full-text search across all of them. Maintained on create/update.
    searchText: v.optional(v.string()),
    // Denormalized: does this base game have ≥1 expansion? For the library filter.
    hasExpansions: v.optional(v.boolean()),
    // Denormalized "similar games" (base-game ids, best-first), recomputed by a
    // daily cron. Lets the detail page read ~6 ids instead of scanning the whole
    // catalogue on every view. Absent until the first recompute.
    similarIds: v.optional(v.array(v.id("games"))),
    // DEPRECATED, unused. The chat-ready gating is gone; this bare optional
    // field lingers only so a prod schema push doesn't fail on docs that still
    // carry it. Run migrations:clearChatReady against prod, then drop this line.
    chatReady: v.optional(v.boolean()),
    // BoardGameGeek id (from the original import) + cached BGG stats.
    bggId: v.optional(v.string()),
    bgg: v.optional(bggStatsValidator),
    // When we last *attempted* a stats refresh, success or not. Distinct from
    // bgg.fetchedAt, which records the last *success* and stays the display
    // value: a game whose fetch keeps failing must still back off, or it would
    // occupy a refresh slot every hour and starve the rest of the catalogue.
    bggCheckedAt: v.optional(v.number()),
    // Auto-created by a user's BGG collection sync to hold a game we don't
    // curate. Stubs carry a title/year/thumbnail and nothing else, and are
    // excluded from every catalogue surface (browse, search, sitemap). Cleared
    // when an admin edits the game, which promotes it to a real entry.
    isStub: v.optional(v.boolean()),
    // Denormalized, indexable sort keys — kept in sync at every write so the
    // library can paginate ordered by rating / title / year / complexity /
    // popularity without scanning the catalogue. See sortKeys() in games.ts.
    sortTitle: v.optional(v.string()), // lowercased title, for A–Z
    yearNum: v.optional(v.number()), // release year as a number
    bggRating: v.optional(v.number()), // = bgg.rating
    bggRatingCount: v.optional(v.number()), // = bgg.ratingCount (popularity)
    bggWeight: v.optional(v.number()), // = bgg.weight (complexity)
  })
    .index("by_slug", ["slug"])
    .index("by_isExpansion", ["isExpansion"])
    .index("by_parent", ["parentId"])
    // Collection/plays rows link to games by BGG id; without this the match is
    // a table scan per synced row.
    .index("by_bgg_id", ["bggId"])
    // The catalogue's real read path: non-stub base games / expansions.
    .index("by_isStub_and_isExpansion", ["isStub", "isExpansion"])
    // Sorted catalogue reads: same (isStub, isExpansion) prefix, then the sort
    // key, so the library paginates ordered without a scan.
    .index("by_lib_title", ["isStub", "isExpansion", "sortTitle"])
    .index("by_lib_year", ["isStub", "isExpansion", "yearNum"])
    .index("by_lib_rating", ["isStub", "isExpansion", "bggRating"])
    .index("by_lib_weight", ["isStub", "isExpansion", "bggWeight"])
    .index("by_lib_rated", ["isStub", "isExpansion", "bggRatingCount"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["isExpansion", "isStub"],
    }),

  // A game can have several rulebooks (Base Rules, Solo Mode, ...). Each is the
  // unit of ingestion and the unit a user selects to chat with.
  rulebooks: defineTable({
    gameId: v.id("games"),
    label: v.string(),
    filename: v.string(),
    storageId: v.id("_storage"),
    // "rulebook" = ingested + used in chat; "download" = add-on (scoring sheet,
    // diagram, …) that is only listed on the game page for download. Missing =
    // "rulebook" (legacy rows).
    kind: v.optional(v.union(v.literal("rulebook"), v.literal("download"))),
    isIngested: v.boolean(),
    ingestState: v.union(
      v.literal("none"),
      v.literal("parsing"),
      v.literal("parsed"),
      v.literal("committed"),
    ),
  }).index("by_game", ["gameId"]),

  // One row per retrievable chunk, with its embedding inline.
  chunks: defineTable({
    rulebookId: v.id("rulebooks"),
    gameId: v.id("games"), // denormalized for TOC / grouping
    breadcrumb: v.string(),
    page: v.optional(v.number()),
    chunkType: v.union(
      v.literal("text"),
      v.literal("table"),
      v.literal("list"),
      v.literal("legend"),
    ),
    scope: v.union(v.literal("main"), v.literal("variant")),
    variantName: v.optional(v.string()),
    text: v.string(),
    embedding: v.array(v.float64()),
  })
    .index("by_rulebook", ["rulebookId"])
    .index("by_rulebook_and_type", ["rulebookId", "chunkType"])
    .index("by_game", ["gameId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 768, // gemini-embedding-001 @ 768 dims (see lib/embedding.ts)
      filterFields: ["rulebookId", "chunkType"],
    }),

  chats: defineTable({
    userId: v.id("users"),
    gameId: v.id("games"),
    selectedRulebookIds: v.array(v.id("rulebooks")),
    lastMessage: v.string(),
    lastMessageAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_game", ["userId", "gameId"]),

  favorites: defineTable({
    userId: v.id("users"),
    gameId: v.id("games"),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_game", ["userId", "gameId"]),

  messages: defineTable({
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    // persisted citation snapshots (bounded to rerankTopN). Our own field —
    // unrelated to the deprecated AI SDK message-annotations API.
    annotations: v.optional(
      v.array(
        v.object({
          n: v.number(),
          gameId: v.id("games"),
          rulebookId: v.id("rulebooks"),
          bgTitle: v.string(),
          breadcrumb: v.optional(v.string()),
          page: v.optional(v.number()),
          chunkType: v.string(),
          scope: v.string(),
          variantName: v.optional(v.string()),
          text: v.string(),
        }),
      ),
    ),
    rating: v.optional(v.union(v.literal("up"), v.literal("down"))),
  }).index("by_chat", ["chatId"]),

  // Per-game FAQ: cached common questions with grounded, cited answers.
  // Keyed on the base game. Regenerated by faqs:generateForGame.
  gameFaqs: defineTable({
    gameId: v.id("games"),
    question: v.string(),
    answer: v.string(),
    annotations: v.array(annotationValidator),
    order: v.number(),
    helpful: v.number(),
    notHelpful: v.number(),
  }).index("by_game", ["gameId"]),

  // One helpfulness vote per user per FAQ (toggles).
  faqVotes: defineTable({
    userId: v.id("users"),
    faqId: v.id("gameFaqs"),
    vote: v.union(v.literal("up"), v.literal("down")),
  }).index("by_user_and_faq", ["userId", "faqId"]),

  // Rulebook-derived component list ("what's in the box"), keyed on the base game.
  gameComponents: defineTable({
    gameId: v.id("games"),
    item: v.string(),
    count: v.number(),
    order: v.number(),
  }).index("by_game", ["gameId"]),

  // Rulebook-derived "rules refresher" — easily-forgotten nitty-gritty facts
  // (starting resources, tie-breakers, scoring specifics, turn edge-cases).
  gameReminders: defineTable({
    gameId: v.id("games"),
    label: v.string(),
    detail: v.string(),
    order: v.number(),
  }).index("by_game", ["gameId"]),

  // --- ingestion draft (3 tables, keyed on a rulebook) ---
  migrationDrafts: defineTable({
    rulebookId: v.id("rulebooks"),
    gameId: v.id("games"),
    gameTitle: v.string(),
    status: v.union(
      v.literal("parsing"),
      v.literal("parsed"),
      v.literal("reviewing"),
      v.literal("committed"),
    ),
    // User control over the background parse loop (absent = running).
    control: v.optional(
      v.union(
        v.literal("running"),
        v.literal("paused"),
        v.literal("stopped"),
      ),
    ),
    totalPages: v.optional(v.number()),
    batchPlan: v.array(
      v.object({
        index: v.number(),
        startPage: v.number(),
        endPage: v.number(),
      }),
    ),
    nextBatchIndex: v.number(),
    iconTokens: v.array(v.string()),
    sectionHeadings: v.array(v.string()),
    removedDuplicates: v.optional(v.number()),
    geminiUsage: v.optional(
      v.object({
        promptTokens: v.number(),
        completionTokens: v.number(),
        totalTokens: v.number(),
      }),
    ),
    error: v.optional(v.string()),
  })
    .index("by_rulebook", ["rulebookId"])
    .index("by_game", ["gameId"]),

  draftBatches: defineTable({
    draftId: v.id("migrationDrafts"),
    index: v.number(),
    startPage: v.number(),
    endPage: v.number(),
    markdown: v.string(),
  }).index("by_draft", ["draftId"]),

  draftChunks: defineTable({
    draftId: v.id("migrationDrafts"),
    order: v.number(),
    breadcrumb: v.string(),
    page: v.optional(v.number()),
    chunkType: v.string(),
    scope: v.string(),
    variantName: v.optional(v.string()),
    text: v.string(),
    originalText: v.optional(v.string()),
    flags: v.array(v.string()),
    accepted: v.boolean(),
    edited: v.boolean(),
  }).index("by_draft", ["draftId"]),

  // Saved tuckbox designs (per user) for autosave + the "My boxes" gallery.
  // Face artwork lives in file storage (data URLs are too big to inline).
  tuckboxes: defineTable({
    userId: v.id("users"),
    name: v.string(),
    unit: v.union(v.literal("mm"), v.literal("in")),
    cardWidth: v.number(),
    cardHeight: v.number(),
    cardCount: v.number(),
    cardThickness: v.number(),
    tolerance: v.number(),
    materialThickness: v.number(),
    paperSize: v.union(v.literal("A4"), v.literal("Letter"), v.literal("A3")),
    orientation: v.union(v.literal("portrait"), v.literal("landscape")),
    imageMode: v.union(v.literal("per-face"), v.literal("wrap")),
    faces: v.array(
      v.object({
        face: v.union(
          v.literal("front"),
          v.literal("back"),
          v.literal("leftSide"),
          v.literal("rightSide"),
          v.literal("top"),
          v.literal("bottom"),
        ),
        storageId: v.id("_storage"),
        naturalWidth: v.number(),
        naturalHeight: v.number(),
        transform: v.object({
          zoom: v.number(),
          anchorX: v.number(),
          anchorY: v.number(),
          rotation: v.number(),
        }),
      }),
    ),
    wrap: v.optional(
      v.object({
        storageId: v.id("_storage"),
        naturalWidth: v.number(),
        naturalHeight: v.number(),
        transform: v.object({
          zoom: v.number(),
          anchorX: v.number(),
          anchorY: v.number(),
          rotation: v.number(),
        }),
      }),
    ),
    // Front (or wrap) blob, reused as the gallery thumbnail.
    coverStorageId: v.optional(v.id("_storage")),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // --- ops / analytics ---
  // Singleton row of runtime-tunable RAG knobs. Read newest via .order("desc").take(1).
  siteConfig: defineTable({
    v2TopK: v.number(),
    v2ScoreThreshold: v.number(),
    rerankTopN: v.number(),
    historyMessageLimit: v.number(),
    // How many top-scoring candidates are sent to the reranker (optional so
    // existing rows stay valid; defaults applied on read).
    rerankCandidates: v.optional(v.number()),
  }),

  usageLog: defineTable({
    purpose: v.union(
      v.literal("chat-answer"),
      v.literal("chat-rerank"),
      v.literal("chat-rewrite"),
      v.literal("chat-embed"),
      v.literal("parse"),
      v.literal("embed"),
    ),
    model: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
  }).index("by_purpose", ["purpose"]),

  searches: defineTable({
    query: v.string(),
    count: v.number(),
  }).index("by_query", ["query"]),

  contactMessages: defineTable({
    name: v.string(),
    email: v.string(),
    message: v.string(),
  }).index("by_email", ["email"]),

  // --- BoardGameGeek account sync ---
  // A user's linked BGG account. Deliberately its own table rather than fields
  // on `users`: `users.me` returns the whole user document to the client, so
  // nothing secret may live there, and sync churn would contend with every
  // `me` subscription.
  bggAccounts: defineTable({
    userId: v.id("users"),
    username: v.string(), // as typed, for display
    usernameLower: v.string(), // lookup / dedupe key
    // BGG session cookie, AES-GCM sealed with BGG_CRED_KEY. We exchange the
    // user's password for this at link time and then discard the password —
    // it is never stored, logged, or returned.
    sessionCookie: v.optional(v.object({ ct: v.string(), iv: v.string() })),
    cookieExpiresAt: v.optional(v.number()),
    status: bggAccountStatusValidator,
    // A classified reason ("bad_credentials", "rate_limited", …) — never a raw
    // response body, which could echo credentials back into the database.
    lastError: v.optional(v.string()),
    linkedAt: v.number(),
    collectionSyncedAt: v.optional(v.number()),
    collectionCount: v.optional(v.number()),
    playsSyncedAt: v.optional(v.number()),
    playsCount: v.optional(v.number()),
    playsSyncedThrough: v.optional(v.string()), // high-water mark, "YYYY-MM-DD"
  })
    .index("by_user", ["userId"])
    .index("by_username_lower", ["usernameLower"]),

  // Sync progress + cursor. Invariant: at most one row per (userId, kind), so
  // `by_user_and_kind(...).unique()` doubles as the "already running?" lock and
  // the table stays at ≤2 rows per user.
  bggSyncJobs: defineTable({
    userId: v.id("users"),
    accountId: v.id("bggAccounts"),
    username: v.string(), // snapshot: the job survives a relink mid-run
    kind: bggSyncKindValidator,
    status: bggSyncStatusValidator,
    runStartedAt: v.number(), // the mark-and-sweep stamp for this run
    page: v.number(),
    totalPages: v.optional(v.number()),
    processed: v.number(),
    total: v.optional(v.number()), // total items to import (known once fetched)
    created: v.optional(v.number()), // new (stub) games created this run
    recentTitles: v.optional(v.array(v.string())), // last few titles, for the progress detail
    // Enrichment phase progress (filling stubs with BGG metadata + covers).
    // The queue is the collection's gameIds captured when enrichment began; the
    // driver walks it by index (enrichProcessed) reading one game per step, so
    // it never re-scans the whole collection (that blew the query read limit).
    enrichQueue: v.optional(v.array(v.id("games"))),
    enrichTotal: v.optional(v.number()), // queue length when enrichment began
    enrichProcessed: v.optional(v.number()), // items handled so far (the cursor)
    currentTitle: v.optional(v.string()), // the game being enriched right now
    attempts: v.number(), // consecutive 202/transient failures; drives backoff
    mode: v.union(v.literal("incremental"), v.literal("full")),
    minDate: v.optional(v.string()),
    updatedAt: v.number(), // watchdog heartbeat
    finishedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_user_and_kind", ["userId", "kind"])
    .index("by_status", ["status"]),

  // One row per collection item. A child table, not an array on the user: a
  // 1000-game collection would blow the 1MB document limit, and an embedded
  // array would rewrite the whole document on every batch.
  bggCollection: defineTable(bggCollectionRowValidator)
    .index("by_user_and_bgg_id", ["userId", "bggId"]) // upsert key
    .index("by_user_and_sort_title", ["userId", "sortTitle"]) // alphabetical page
    .index("by_user_and_synced_at", ["userId", "syncedAt"]) // sweep stale rows
    .index("by_user_and_game", ["userId", "gameId"])
    // Cross-user: adopt every user's rows when an admin gives a game its BGG id.
    .index("by_bgg_id", ["bggId"]),

  // One row per recorded play session (hand-logged or imported from BGG).
  plays: defineTable(playRowValidator)
    .index("by_user_and_date", ["userId", "date"])
    .index("by_game_and_date", ["gameId", "date"])
    .index("by_visibility_and_date", ["visibility", "date"]) // public feed (later)
    .index("by_bgg_play_id", ["bggPlayId"]), // idempotent BGG import dedupe

  // An owner's saved non-system players, reused across their plays.
  playPeople: defineTable(playPersonValidator)
    .index("by_owner", ["ownerId"])
    .index("by_owner_and_name", ["ownerId", "name"])
    .index("by_owner_and_email", ["ownerId", "emailLower"])
    .index("by_email", ["emailLower"]), // claim-on-signup

  // Indexed play↔participant links: "plays I was in" + email-claim are index
  // scans (the embedded players[] array isn't queryable).
  playParticipants: defineTable(playParticipantValidator)
    .index("by_user_and_date", ["userId", "date"])
    .index("by_email", ["emailLower"])
    .index("by_play", ["playId"]),

  // The social feed. One post per shared item (play / image / toplist). Holds
  // only shared content and references plays/lists rather than duplicating them.
  posts: defineTable(postRowValidator)
    .index("by_visibility_and_created", ["visibility", "createdAt"]) // the feed
    .index("by_user_and_created", ["userId", "createdAt"]) // a user's posts
    .index("by_play", ["playId"]), // upsert/unshare a play's post

  // Likes on posts — one per user, toggled (count denormalized on the post).
  postReactions: defineTable(postReactionValidator)
    .index("by_user_and_post", ["userId", "postId"])
    .index("by_post", ["postId"]),

  // Comments on public posts (count denormalized on the post).
  postComments: defineTable(postCommentValidator)
    .index("by_post_and_created", ["postId", "createdAt"])
    .index("by_user", ["userId"]), // aggregate a user's received comment likes

  // Likes on post comments — one per user, toggled (count on the comment).
  postCommentReactions: defineTable(postCommentReactionValidator)
    .index("by_user_and_comment", ["userId", "commentId"])
    .index("by_comment", ["commentId"]),

  // In-app notifications (likes / comments / mentions on your posts).
  notifications: defineTable(notificationValidator)
    .index("by_user_and_created", ["userId", "createdAt"]) // the list
    .index("by_user_and_read", ["userId", "read"]) // unread badge count
    .index("by_post", ["postId"]), // cleanup on post delete

  // A user's ranked "Top N games" list for a given year. Entries are a bounded
  // (≤ ~250) inline array — array index = rank − 1 — so a drag-reorder is one
  // cheap patch and a finalized list is a self-contained snapshot (the cached
  // `title` keeps history/aggregates readable even if a game is later deleted).
  // Identity is (userId, size, year): at most one row per triple.
  topGamesLists: defineTable({
    userId: v.id("users"),
    // The kind of games this list ranks — see convex/lib/topGamesCategories.ts.
    // Optional at the storage layer (added field); code always writes it and
    // reads coalesce a missing value to the default "overall" category.
    category: v.optional(v.string()),
    size: v.number(), // preset 10/25/50/100 or a custom int (3..250)
    year: v.number(), // the year this list represents
    title: v.optional(v.string()), // custom name; default "Top {size} · {year}"
    status: v.union(v.literal("draft"), v.literal("finalized")),
    // public ⇒ finalized only; reopening to draft forces this back to private.
    visibility: v.union(v.literal("private"), v.literal("public")),
    entries: v.array(
      v.object({ gameId: v.id("games"), title: v.string() }),
    ),
    finalizedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_size", ["userId", "size"]) // owner history per size
    // Uniqueness: at most one list per (user, category, size, year).
    .index("by_user_category_size_year", [
      "userId",
      "category",
      "size",
      "year",
    ])
    .index("by_user_and_status", ["userId", "status"])
    // Community roll-up across all users for a category/year.
    .index("by_visibility_category_year", ["visibility", "category", "year"]),
});
