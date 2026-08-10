import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { annotationValidator } from "./lib/annotations";

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
    .index("by_upgrade_token", ["upgradeToken"]),

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
    // Denormalized: does this base game's family (itself + expansions) have ≥1
    // ingested rulebook? i.e. can a user actually chat with it. Maintained on
    // ingest / un-ingest / delete. The library only shows chat-ready games.
    chatReady: v.optional(v.boolean()),
    // BoardGameGeek id (from the original import) + cached BGG stats.
    bggId: v.optional(v.string()),
    bgg: v.optional(
      v.object({
        rating: v.optional(v.number()),
        ratingCount: v.optional(v.number()),
        weight: v.optional(v.number()),
        playerPoll: v.optional(
          v.array(
            v.object({
              count: v.number(),
              best: v.number(),
              recommended: v.number(),
              notRecommended: v.number(),
            }),
          ),
        ),
        fetchedAt: v.optional(v.number()),
      }),
    ),
  })
    .index("by_slug", ["slug"])
    .index("by_isExpansion", ["isExpansion"])
    .index("by_chat_ready", ["chatReady"])
    .index("by_parent", ["parentId"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["isExpansion", "chatReady"],
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
      dimensions: 768, // Google text-embedding-004
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

  // Rulebook-derived glossary of terms/icons (keyed on the base game).
  glossaryTerms: defineTable({
    gameId: v.id("games"),
    term: v.string(),
    definition: v.string(),
    order: v.number(),
  }).index("by_game", ["gameId"]),

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
});
