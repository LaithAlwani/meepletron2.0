import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAdmin, getCurrentUser } from "./lib/auth";
import { slugify, slugifyUnique } from "./lib/slug";
import { buildSearchText, gameNameMatchScore } from "./lib/gameSearch";
import { bggStatsValidator } from "./lib/bggStats";

/** Resolve a game's storage ids into signed URLs for the client. */
async function withMedia(ctx: QueryCtx, game: Doc<"games">) {
  const [imageUrl, thumbnailUrl] = await Promise.all([
    game.imageId ? ctx.storage.getUrl(game.imageId) : Promise.resolve(null),
    game.thumbnailId
      ? ctx.storage.getUrl(game.thumbnailId)
      : Promise.resolve(null),
  ]);
  return { ...game, imageUrl, thumbnailUrl };
}

export type GameWithMedia = Awaited<ReturnType<typeof withMedia>>;

/** A rulebook enriched with a normalized `kind` and a signed download URL. */
async function rulebookWithMeta(ctx: QueryCtx, rb: Doc<"rulebooks">) {
  return {
    ...rb,
    kind: rb.kind ?? ("rulebook" as const),
    downloadUrl: await ctx.storage.getUrl(rb.storageId),
  };
}

export type RulebookWithMeta = Awaited<ReturnType<typeof rulebookWithMeta>>;

/** Base games (not expansions) for the library grid. Reactive. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db
      .query("games")
      .withIndex("by_isStub_and_isExpansion", (q) =>
        q.eq("isStub", false).eq("isExpansion", false),
      )
      .take(200);
    return await Promise.all(games.map((g) => withMedia(ctx, g)));
  },
});

/** Paginated base-game library. */
export const listPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query("games")
      .withIndex("by_isStub_and_isExpansion", (q) =>
        q.eq("isStub", false).eq("isExpansion", false),
      )
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(result.page.map((g) => withMedia(ctx, g))),
    };
  },
});

/** Paginated fuzzy search across title, designers, publishers, categories, mechanics. */
export const searchPaginated = query({
  args: { term: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { term, paginationOpts }) => {
    const trimmed = term.trim();
    if (!trimmed) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const result = await ctx.db
      .query("games")
      .withSearchIndex("search_text", (q) =>
        q.search("searchText", trimmed).eq("isExpansion", false).eq("isStub", false),
      )
      .paginate(paginationOpts);
    // The full-text index is typo-tolerant, which for short queries drags in
    // unrelated games (e.g. "wall" → "ball"). Keep only rows that actually
    // contain every typed term (in the title/designers/publishers/… blob).
    const terms = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
    const relevant = result.page.filter((g) => {
      const hay = (g.searchText ?? g.title).toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    return {
      ...result,
      page: await Promise.all(relevant.map((g) => withMedia(ctx, g))),
    };
  },
});

/**
 * Fuzzy-resolve a free-text game name to base-game candidates, best match first.
 * Unlike `searchPaginated` (an exact full-text index for the library grid), this
 * is tolerant of spacing, punctuation and typos — "lord's of water deep" →
 * "Lords of Waterdeep" — so the global assistant can suggest a game even when the
 * user doesn't spell the title exactly. Scans base games (~a few hundred) and
 * ranks by a normalized edit-distance / token score.
 */
export const resolveByName = query({
  args: { term: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { term, limit }) => {
    const q = term.trim();
    if (q.length < 2) return [];
    const games = await ctx.db
      .query("games")
      .withIndex("by_isStub_and_isExpansion", (qi) =>
        qi.eq("isStub", false).eq("isExpansion", false),
      )
      .take(1000);
    const ranked = games
      .map((g) => ({ g, score: gameNameMatchScore(q, g.title) }))
      // 0.5 keeps close spellings/typos ("waterdeep", "catn") while dropping
      // unrelated titles.
      .filter((s) => s.score >= 0.5)
      .sort((a, b) => b.score - a.score);
    // Surface runners-up that are reasonably near the best match, so genuinely
    // similar names ("ticket to ride", the Catan family) all show — but a clear
    // winner ("blod rage" → Blood Rage) isn't padded with weak matches.
    const top = ranked[0]?.score ?? 0;
    const scored = ranked
      .filter((s) => s.score >= Math.max(0.5, top - 0.25))
      .slice(0, Math.max(1, Math.min(limit ?? 5, 8)));
    return await Promise.all(scored.map((s) => withMedia(ctx, s.g)));
  },
});

/** Paginated base-game library with optional filters (players / time / expansions). */
export const browsePaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    players: v.optional(v.number()),
    time: v.optional(
      v.union(v.literal("quick"), v.literal("standard"), v.literal("epic")),
    ),
    hasExpansions: v.optional(v.boolean()),
  },
  handler: async (ctx, { paginationOpts, players, time, hasExpansions }) => {
    // Enriched base games only — unenriched BGG stubs are hidden until the sync
    // has filled them in (isStub flips false), so the library never shows blanks.
    const base = ctx.db
      .query("games")
      .withIndex("by_isStub_and_isExpansion", (q) =>
        q.eq("isStub", false).eq("isExpansion", false),
      )
      .order("desc");

    const needsFilter = players != null || time != null || hasExpansions;
    const q = needsFilter
      ? base.filter((fq) => {
          const conds = [];
          if (players != null) {
            conds.push(
              fq.and(
                fq.lte(fq.field("minPlayers"), players),
                fq.gte(fq.field("maxPlayers"), players),
              ),
            );
          }
          if (time === "quick") conds.push(fq.lte(fq.field("maxPlayTime"), 30));
          else if (time === "standard")
            conds.push(
              fq.and(
                fq.gt(fq.field("maxPlayTime"), 30),
                fq.lte(fq.field("maxPlayTime"), 90),
              ),
            );
          else if (time === "epic")
            conds.push(fq.gt(fq.field("maxPlayTime"), 90));
          if (hasExpansions)
            conds.push(fq.eq(fq.field("hasExpansions"), true));
          return fq.and(...conds);
        })
      : base;

    const result = await q.paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(result.page.map((g) => withMedia(ctx, g))),
    };
  },
});

/**
 * Exact count of base games matching the library filters — for the "Board
 * games (N)" header. Scans only base games (~a few hundred), no media.
 * Keep the filter logic in sync with `browsePaginated`.
 */
export const browseCount = query({
  args: {
    players: v.optional(v.number()),
    time: v.optional(
      v.union(v.literal("quick"), v.literal("standard"), v.literal("epic")),
    ),
    hasExpansions: v.optional(v.boolean()),
  },
  handler: async (ctx, { players, time, hasExpansions }) => {
    const base = ctx.db
      .query("games")
      .withIndex("by_isStub_and_isExpansion", (q) =>
        q.eq("isStub", false).eq("isExpansion", false),
      );

    const needsFilter = players != null || time != null || hasExpansions;
    const q = needsFilter
      ? base.filter((fq) => {
          const conds = [];
          if (players != null) {
            conds.push(
              fq.and(
                fq.lte(fq.field("minPlayers"), players),
                fq.gte(fq.field("maxPlayers"), players),
              ),
            );
          }
          if (time === "quick") conds.push(fq.lte(fq.field("maxPlayTime"), 30));
          else if (time === "standard")
            conds.push(
              fq.and(
                fq.gt(fq.field("maxPlayTime"), 30),
                fq.lte(fq.field("maxPlayTime"), 90),
              ),
            );
          else if (time === "epic")
            conds.push(fq.gt(fq.field("maxPlayTime"), 90));
          if (hasExpansions)
            conds.push(fq.eq(fq.field("hasExpansions"), true));
          return fq.and(...conds);
        })
      : base;

    const rows = await q.collect();
    return rows.length;
  },
});

/**
 * Base-game ids whose family (the base game itself or any of its expansions)
 * has at least one ingested rulebook — i.e. the games Meepletron can actually
 * chat about. "download" add-ons don't count. Scans rulebooks (~a few hundred).
 */
async function chatEnabledBaseIds(ctx: QueryCtx): Promise<Set<Id<"games">>> {
  const rulebooks = await ctx.db.query("rulebooks").collect();
  const withRules = new Set<Id<"games">>();
  for (const rb of rulebooks) {
    if (rb.isIngested && (rb.kind ?? "rulebook") !== "download") {
      withRules.add(rb.gameId);
    }
  }
  const baseIds = new Set<Id<"games">>();
  for (const gid of withRules) {
    const g = await ctx.db.get("games", gid);
    if (!g) continue;
    baseIds.add(g.isExpansion && g.parentId ? g.parentId : g._id);
  }
  return baseIds;
}

type LibraryTime = "quick" | "standard" | "epic";

/** JS mirror of browsePaginated's players/time/expansions filter. */
function matchesLibraryFilters(
  g: Doc<"games">,
  players?: number,
  time?: LibraryTime,
  hasExpansions?: boolean,
): boolean {
  if (players != null) {
    if (
      g.minPlayers == null ||
      g.maxPlayers == null ||
      g.minPlayers > players ||
      g.maxPlayers < players
    ) {
      return false;
    }
  }
  if (time === "quick" && !(g.maxPlayTime != null && g.maxPlayTime <= 30)) return false;
  if (
    time === "standard" &&
    !(g.maxPlayTime != null && g.maxPlayTime > 30 && g.maxPlayTime <= 90)
  ) {
    return false;
  }
  if (time === "epic" && !(g.maxPlayTime != null && g.maxPlayTime > 90)) return false;
  if (hasExpansions && !g.hasExpansions) return false;
  return true;
}

/**
 * Every base game Meepletron can chat about (family has an ingested rulebook),
 * newest first, with the same optional players/time/expansions filters and
 * search term as the library grid. The chat-ready set is small (curated), so
 * this returns the whole filtered list in one shot — no pagination needed.
 */
export const chatEnabledGames = query({
  args: {
    term: v.optional(v.string()),
    players: v.optional(v.number()),
    time: v.optional(
      v.union(v.literal("quick"), v.literal("standard"), v.literal("epic")),
    ),
    hasExpansions: v.optional(v.boolean()),
  },
  handler: async (ctx, { term, players, time, hasExpansions }) => {
    const baseIds = await chatEnabledBaseIds(ctx);
    const games: Doc<"games">[] = [];
    for (const id of baseIds) {
      const g = await ctx.db.get("games", id);
      // Stubs/expansions never qualify as a chattable library entry.
      if (!g || g.isStub || g.isExpansion) continue;
      if (!matchesLibraryFilters(g, players, time, hasExpansions)) continue;
      games.push(g);
    }
    // Optional search: keep rows whose blob contains every typed term (matches
    // searchPaginated's relevance rule).
    const trimmed = (term ?? "").trim().toLowerCase();
    const terms = trimmed.split(/\s+/).filter(Boolean);
    const filtered = terms.length
      ? games.filter((g) => {
          const hay = (g.searchText ?? g.title).toLowerCase();
          return terms.every((t) => hay.includes(t));
        })
      : games;
    filtered.sort((a, b) => b._creationTime - a._creationTime);
    return await Promise.all(filtered.map((g) => withMedia(ctx, g)));
  },
});

type Complexity = "light" | "medium" | "heavy";

/** BGG weight bands → light (≤2) / medium (≤3) / heavy (>3). */
function matchesComplexity(g: Doc<"games">, complexity?: Complexity): boolean {
  if (!complexity) return true;
  const w = g.bgg?.weight;
  if (w == null) return false; // can't honor a complexity filter without a weight
  if (complexity === "light") return w <= 2;
  if (complexity === "medium") return w > 2 && w <= 3;
  return w > 3;
}

/** Compact "2–4p · 60 min · Medium" line for a recommendation card. */
function recDetail(g: Doc<"games">): string {
  const parts: string[] = [];
  if (g.minPlayers != null && g.maxPlayers != null) {
    parts.push(
      g.minPlayers === g.maxPlayers
        ? `${g.minPlayers}p`
        : `${g.minPlayers}–${g.maxPlayers}p`,
    );
  }
  const t = g.maxPlayTime ?? g.minPlayTime;
  if (t) parts.push(`${t} min`);
  const w = g.bgg?.weight;
  if (w != null) parts.push(w <= 2 ? "Light" : w <= 3 ? "Medium" : "Heavy");
  return parts.join(" · ");
}

/** Does this game's player poll mark `players` as its best count? (soft ranking) */
function isBestAt(g: Doc<"games">, players: number): boolean {
  const poll = g.bgg?.playerPoll;
  if (!poll) return false;
  const entry = poll.find((p) => p.count === players);
  if (!entry) return false;
  return entry.best >= entry.recommended && entry.best > entry.notRecommended;
}

/**
 * "What should I play?" — recommend games for a player count / time / complexity,
 * drawn either from the user's owned collection or the whole library. Ranks by
 * BGG rating, nudging games the community rates best at that player count. Returns
 * an `issue` when the owned source can't be used (guest, or empty collection) so
 * the client can steer to the library instead.
 */
export const recommend = query({
  args: {
    source: v.union(v.literal("owned"), v.literal("library")),
    players: v.optional(v.number()),
    time: v.optional(
      v.union(v.literal("quick"), v.literal("standard"), v.literal("epic")),
    ),
    complexity: v.optional(
      v.union(v.literal("light"), v.literal("medium"), v.literal("heavy")),
    ),
  },
  handler: async (ctx, { source, players, time, complexity }) => {
    let pool: Doc<"games">[] = [];
    let issue: null | "signin" | "no-collection" = null;

    if (source === "owned") {
      const user = await getCurrentUser(ctx);
      if (!user) {
        issue = "signin";
      } else {
        const rows = await ctx.db
          .query("bggCollection")
          .withIndex("by_user_and_sort_title", (q) => q.eq("userId", user._id))
          .collect();
        const owned = rows.filter((r) => r.own && r.gameId && !r.isExpansion);
        if (owned.length === 0) {
          issue = "no-collection";
        } else {
          const games = await Promise.all(
            owned.map((r) => ctx.db.get("games", r.gameId as Id<"games">)),
          );
          pool = games.filter(
            (g): g is Doc<"games"> => !!g && !g.isExpansion && !g.isStub,
          );
        }
      }
    } else {
      pool = await ctx.db
        .query("games")
        .withIndex("by_isStub_and_isExpansion", (q) =>
          q.eq("isStub", false).eq("isExpansion", false),
        )
        .take(1000);
    }

    const matched = pool.filter(
      (g) =>
        matchesLibraryFilters(g, players, time, undefined) &&
        matchesComplexity(g, complexity),
    );
    matched.sort((a, b) => {
      const bonus = (g: Doc<"games">) =>
        (g.bgg?.rating ?? 0) + (players != null && isBestAt(g, players) ? 0.5 : 0);
      return bonus(b) - bonus(a);
    });

    const chatIds = await chatEnabledBaseIds(ctx);
    const top = matched.slice(0, 8);
    const games = await Promise.all(
      top.map(async (g) => {
        const withM = await withMedia(ctx, g);
        return {
          _id: g._id,
          slug: g.slug,
          title: g.title,
          imageUrl: withM.imageUrl,
          thumbnailUrl: withM.thumbnailUrl,
          detail: recDetail(g),
          chattable: chatIds.has(g._id),
        };
      }),
    );
    return { issue, games };
  },
});

/**
 * Games similar to `gameId`, ranked by shared mechanics/categories (+ a small
 * bonus for shared designers). Base games only; excludes the game itself. Cheap
 * full scan over base games (~a few hundred).
 */
export const similarGames = query({
  args: { gameId: v.id("games"), limit: v.optional(v.number()) },
  handler: async (ctx, { gameId, limit }) => {
    const game = await ctx.db.get("games", gameId);
    if (!game) return [];
    // Score against the base game of the family.
    const base =
      game.isExpansion && game.parentId
        ? ((await ctx.db.get("games", game.parentId)) ?? game)
        : game;

    const norm = (s: string) => s.trim().toLowerCase();
    const cats = new Set(base.categories.map(norm));
    const mechs = new Set(base.gameMechanics.map(norm));
    const designers = new Set(base.designers.map(norm));
    if (cats.size === 0 && mechs.size === 0) return [];

    // Stub games (auto-created by BGG collection sync) carry no categories or
    // mechanics, so they'd score zero anyway — but they'd still eat the take().
    const candidates = await ctx.db
      .query("games")
      .withIndex("by_isStub_and_isExpansion", (q) =>
        q.eq("isStub", false).eq("isExpansion", false),
      )
      .take(1000);

    const scored = candidates
      .filter((c) => c._id !== base._id)
      .map((c) => {
        let score = 0;
        for (const x of c.gameMechanics) if (mechs.has(norm(x))) score += 2;
        for (const x of c.categories) if (cats.has(norm(x))) score += 1.5;
        for (const x of c.designers) if (designers.has(norm(x))) score += 1;
        return { c, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(limit ?? 6, 12)));

    return await Promise.all(scored.map((s) => withMedia(ctx, s.c)));
  },
});

/** Assemble a game detail: the game (with media), parent, expansions, rulebooks. */
async function gameDetail(ctx: QueryCtx, game: Doc<"games">) {
  const [expansions, rulebookDocs, parentDoc] = await Promise.all([
    ctx.db
      .query("games")
      .withIndex("by_parent", (q) => q.eq("parentId", game._id))
      .take(100),
    ctx.db
      .query("rulebooks")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .take(50),
    game.parentId
      ? ctx.db.get("games", game.parentId)
      : Promise.resolve(null),
  ]);
  return {
    ...(await withMedia(ctx, game)),
    // For expansions, the base game they belong to (null for base games).
    parent: parentDoc ? await withMedia(ctx, parentDoc) : null,
    expansions: await Promise.all(expansions.map((e) => withMedia(ctx, e))),
    rulebooks: await Promise.all(
      rulebookDocs.map((rb) => rulebookWithMeta(ctx, rb)),
    ),
  };
}

/** A game detail by id. */
export const getById = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get("games", gameId);
    return game ? await gameDetail(ctx, game) : null;
  },
});

/**
 * A game detail by slug (SEO-friendly URLs), falling back to id so old
 * `/boardgames/<id>` links keep resolving.
 */
export const getByHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    let game = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", handle))
      .first();
    if (!game) {
      const asId = ctx.db.normalizeId("games", handle);
      if (asId) game = await ctx.db.get("games", asId);
    }
    return game ? await gameDetail(ctx, game) : null;
  },
});

/**
 * Chat sources for a game family, grouped by game (base first, then expansions
 * that have ingested rulebooks). Only ingested rulebooks — the ones the chat can
 * actually retrieve from. `gameId` is resolved to its base game.
 */
export const chatSources = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get("games", gameId);
    if (!game) return [];
    const baseId =
      game.isExpansion && game.parentId ? game.parentId : game._id;
    const base = baseId === game._id ? game : await ctx.db.get("games", baseId);
    if (!base) return [];

    const expansions = await ctx.db
      .query("games")
      .withIndex("by_parent", (q) => q.eq("parentId", baseId))
      .take(100);

    const groupFor = async (g: Doc<"games">, isBase: boolean) => {
      const rbs = await ctx.db
        .query("rulebooks")
        .withIndex("by_game", (q) => q.eq("gameId", g._id))
        .take(50);
      return {
        gameId: g._id,
        gameTitle: g.title,
        isBase,
        rulebooks: rbs
          .filter((r) => r.isIngested)
          .map((r) => ({ _id: r._id, label: r.label })),
      };
    };

    const groups = [await groupFor(base, true)];
    for (const exp of expansions) {
      const grp = await groupFor(exp, false);
      if (grp.rulebooks.length > 0) groups.push(grp);
    }
    return groups;
  },
});

// ---------------------------------------------------------------------------
// Admin CRUD
// ---------------------------------------------------------------------------

/** All games (base + expansions), for the admin list. */
/**
 * Lightweight list of every game for the admin index — just the fields the
 * list row + search + ingest filters need (no heavy metadata/searchText). The
 * page renders/searches/filters/pages this client-side.
 */
export const adminList = query({
  args: { includeStubs: v.optional(v.boolean()) },
  handler: async (ctx, { includeStubs }) => {
    await requireAdmin(ctx);
    // Stubs are excluded by default: they're created newest-first by collection
    // sync, so including them would push every curated game out of the take().
    // Pass includeStubs to find them and promote one by editing it.
    const games = includeStubs
      ? await ctx.db.query("games").order("desc").take(1000)
      : await ctx.db
          .query("games")
          .withIndex("by_isStub_and_isExpansion", (q) => q.eq("isStub", false))
          .order("desc")
          .take(1000);
    return await Promise.all(
      games.map(async (g) => {
        const rulebooks = await ctx.db
          .query("rulebooks")
          .withIndex("by_game", (q) => q.eq("gameId", g._id))
          // Only chat rulebooks are ingestable; "download" add-ons are not.
          .collect();
        const files = rulebooks.filter((r) => (r.kind ?? "rulebook") !== "download");
        const ingested = files.filter((r) => r.isIngested).length;
        return {
          _id: g._id,
          title: g.title,
          slug: g.slug,
          isExpansion: g.isExpansion,
          isStub: !!g.isStub,
          thumbnailUrl: g.thumbnailId
            ? await ctx.storage.getUrl(g.thumbnailId)
            : null,
          fileCount: files.length,
          ingestedCount: ingested,
        };
      }),
    );
  },
});

const metadataFields = {
  year: v.optional(v.string()),
  minPlayers: v.optional(v.number()),
  maxPlayers: v.optional(v.number()),
  minAge: v.optional(v.string()),
  minPlayTime: v.optional(v.number()),
  maxPlayTime: v.optional(v.number()),
  description: v.optional(v.string()),
  designers: v.optional(v.array(v.string())),
  artists: v.optional(v.array(v.string())),
  publishers: v.optional(v.array(v.string())),
  categories: v.optional(v.array(v.string())),
  gameMechanics: v.optional(v.array(v.string())),
  bggId: v.optional(v.string()),
  bgg: v.optional(bggStatsValidator),
};

export const createGame = mutation({
  args: {
    title: v.string(),
    isExpansion: v.boolean(),
    parentId: v.optional(v.id("games")),
    ...metadataFields,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const title = args.title.trim();
    if (!title) throw new Error("Title is required");
    // Mark the parent as having expansions.
    if (args.isExpansion && args.parentId) {
      await ctx.db.patch("games", args.parentId, { hasExpansions: true });
    }
    const gameId = await ctx.db.insert("games", {
      title,
      slug: slugify(title),
      isExpansion: args.isExpansion,
      // Explicit: the catalogue reads through by_isStub_and_isExpansion, and an
      // absent field doesn't match `eq("isStub", false)` — a new game would be
      // invisible in the library.
      isStub: false,
      parentId: args.parentId,
      year: args.year,
      minPlayers: args.minPlayers,
      maxPlayers: args.maxPlayers,
      minAge: args.minAge,
      minPlayTime: args.minPlayTime,
      maxPlayTime: args.maxPlayTime,
      description: args.description,
      designers: args.designers ?? [],
      artists: args.artists ?? [],
      publishers: args.publishers ?? [],
      categories: args.categories ?? [],
      gameMechanics: args.gameMechanics ?? [],
      bggId: args.bggId,
      bgg: args.bgg,
      searchText: buildSearchText({
        title,
        designers: args.designers,
        publishers: args.publishers,
        categories: args.categories,
        gameMechanics: args.gameMechanics,
      }),
    });
    // Adopt any collection rows already pointing at this BGG id.
    if (args.bggId) {
      await ctx.scheduler.runAfter(0, internal.bggSync.relinkGameToBggRows, {
        gameId,
        bggId: args.bggId,
      });
    }
    return gameId;
  },
});

export const updateGame = mutation({
  args: {
    gameId: v.id("games"),
    title: v.optional(v.string()),
    isExpansion: v.optional(v.boolean()),
    parentId: v.optional(v.id("games")),
    ...metadataFields,
  },
  handler: async (ctx, { gameId, ...rest }) => {
    await requireAdmin(ctx);
    const game = await ctx.db.get("games", gameId);
    if (!game) throw new Error("Game not found");
    const patch: Record<string, unknown> = { ...rest };
    if (rest.title !== undefined) {
      const title = rest.title.trim();
      if (!title) throw new Error("Title cannot be empty");
      patch.title = title;
      // Collision-safe: stub games created by collection sync mean duplicate
      // titles are now routine, and by_slug lookups take the first match.
      patch.slug = await slugifyUnique(ctx, title, gameId);
    }
    // An admin editing a game is what promotes it out of stub state.
    if (game.isStub) patch.isStub = false;
    patch.searchText = buildSearchText({
      title: (patch.title as string | undefined) ?? game.title,
      designers: rest.designers ?? game.designers,
      publishers: rest.publishers ?? game.publishers,
      categories: rest.categories ?? game.categories,
      gameMechanics: rest.gameMechanics ?? game.gameMechanics,
    });
    await ctx.db.patch("games", gameId, patch);

    // Newly-set BGG id: adopt the collection rows that were waiting for it.
    if (rest.bggId && rest.bggId !== game.bggId) {
      await ctx.scheduler.runAfter(0, internal.bggSync.relinkGameToBggRows, {
        gameId,
        bggId: rest.bggId,
      });
    }
  },
});

/** Attach an uploaded image as the game's cover (validates content type). */
export const setGameImage = mutation({
  args: {
    gameId: v.id("games"),
    storageId: v.id("_storage"),
    // Optional smaller crop for grids/lists; falls back to the cover.
    thumbnailId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { gameId, storageId, thumbnailId }) => {
    await requireAdmin(ctx);
    const meta = await ctx.db.system.get("_storage", storageId);
    if (!meta || !(meta.contentType ?? "").startsWith("image/")) {
      throw new Error("Cover must be an image file");
    }
    const game = await ctx.db.get("games", gameId);
    if (!game) throw new Error("Game not found");

    const newThumb = thumbnailId ?? storageId;
    // Free the previous cover + thumbnail blobs, but never the ones we're about
    // to reference (cover and thumb can legitimately be the same storageId).
    const stale = new Set<Id<"_storage">>();
    if (game.imageId) stale.add(game.imageId);
    if (game.thumbnailId) stale.add(game.thumbnailId);
    stale.delete(storageId);
    stale.delete(newThumb);
    for (const id of stale) await ctx.storage.delete(id);

    await ctx.db.patch("games", gameId, {
      imageId: storageId,
      thumbnailId: newThumb,
    });
  },
});

/* -------------------------------------------------------------------------- */
/* Stub enrichment (BGG collection sync fills stubs into full entries)         */
/* -------------------------------------------------------------------------- */

/** How long before a failed enrichment attempt is retried. */
const ENRICH_RETRY_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Stub games (auto-created by BGG collection sync) that still need enriching —
 * they carry a BGG id and either were never attempted or backed off past the
 * retry TTL. `bggCheckedAt` doubles as the "attempted" stamp so a permanently
 * failing id doesn't loop the sweep forever.
 */
export const dueForEnrich = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const now = Date.now();
    const stubs = await ctx.db
      .query("games")
      .withIndex("by_isStub_and_isExpansion", (q) => q.eq("isStub", true))
      .take(500);
    return stubs
      .filter(
        (g) =>
          !!g.bggId &&
          now - (g.bggCheckedAt ?? 0) >= ENRICH_RETRY_TTL_MS,
      )
      .slice(0, limit)
      .map((g) => ({ gameId: g._id, bggId: g.bggId as string }));
  },
});

const enrichMetaValidator = v.object({
  title: v.optional(v.string()),
  year: v.optional(v.string()),
  minPlayers: v.optional(v.number()),
  maxPlayers: v.optional(v.number()),
  minAge: v.optional(v.string()),
  minPlayTime: v.optional(v.number()),
  maxPlayTime: v.optional(v.number()),
  description: v.optional(v.string()),
  designers: v.optional(v.array(v.string())),
  artists: v.optional(v.array(v.string())),
  publishers: v.optional(v.array(v.string())),
  categories: v.optional(v.array(v.string())),
  gameMechanics: v.optional(v.array(v.string())),
});

/**
 * Promote a stub into a full catalogue entry with the metadata + cover fetched
 * from BGG. No-ops (and frees any stored blobs) when the game is gone or has
 * already been curated — an automated import must never clobber an admin's work.
 * Always stamps `bggCheckedAt` so a failed family doesn't re-loop the sweep.
 */
export const applyStubEnrichment = internalMutation({
  args: {
    gameId: v.id("games"),
    meta: enrichMetaValidator,
    bgg: v.optional(bggStatsValidator),
    imageId: v.optional(v.id("_storage")),
    thumbnailId: v.optional(v.id("_storage")),
    // Set from the authoritative /thing item type + its inbound base-game link.
    isExpansion: v.optional(v.boolean()),
    parentId: v.optional(v.id("games")),
  },
  handler: async (
    ctx,
    { gameId, meta, bgg, imageId, thumbnailId, isExpansion, parentId },
  ) => {
    const game = await ctx.db.get("games", gameId);
    if (!game || !game.isStub) {
      // Drop blobs stored speculatively before we knew we'd skip.
      if (imageId) await ctx.storage.delete(imageId);
      if (thumbnailId && thumbnailId !== imageId) {
        await ctx.storage.delete(thumbnailId);
      }
      return;
    }
    const title = meta.title?.trim() || game.title;
    const patch: Record<string, unknown> = {
      isStub: false,
      title,
      // Slug is deliberately left as-is: the collection already links to it and
      // the enriched title barely differs from the stub's.
      year: meta.year ?? game.year,
      minPlayers: meta.minPlayers,
      maxPlayers: meta.maxPlayers,
      minAge: meta.minAge,
      minPlayTime: meta.minPlayTime,
      maxPlayTime: meta.maxPlayTime,
      description: meta.description,
      designers: meta.designers ?? [],
      artists: meta.artists ?? [],
      publishers: meta.publishers ?? [],
      categories: meta.categories ?? [],
      gameMechanics: meta.gameMechanics ?? [],
      searchText: buildSearchText({
        title,
        designers: meta.designers,
        publishers: meta.publishers,
        categories: meta.categories,
        gameMechanics: meta.gameMechanics,
      }),
      bggCheckedAt: Date.now(),
    };
    if (bgg) patch.bgg = bgg;
    if (imageId) {
      patch.imageId = imageId;
      patch.thumbnailId = thumbnailId ?? imageId;
    }
    if (isExpansion !== undefined) patch.isExpansion = isExpansion;
    if (parentId) {
      patch.parentId = parentId;
      const parent = await ctx.db.get("games", parentId);
      if (parent && !parent.hasExpansions) {
        await ctx.db.patch("games", parentId, { hasExpansions: true });
      }
    }
    await ctx.db.patch("games", gameId, patch);
  },
});

/**
 * Find the game for a BGG id, creating a bare stub when we don't have it. Used
 * to guarantee an expansion's base game exists before we link to it (the base
 * may not be in the user's collection). Returns whether the base still needs
 * enriching — true for a freshly-created stub *and* for one that already existed
 * but hasn't been filled yet — so the caller can (re)schedule its enrichment.
 */
export const ensureStubForBgg = internalMutation({
  args: { bggId: v.string(), title: v.string() },
  handler: async (
    ctx,
    { bggId, title },
  ): Promise<{ gameId: Id<"games">; needsEnrich: boolean }> => {
    const existing = await ctx.db
      .query("games")
      .withIndex("by_bgg_id", (q) => q.eq("bggId", bggId))
      .first();
    if (existing) {
      // Enrich it too if it's still an unfilled stub; leave curated games alone.
      return { gameId: existing._id, needsEnrich: existing.isStub === true };
    }
    const gameId = await ctx.db.insert("games", {
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
    });
    return { gameId, needsEnrich: true };
  },
});

/** Minimal lookup by BGG id — used by the on-demand import to dedupe + resolve slug. */
export const gameByBggId = internalQuery({
  args: { bggId: v.string() },
  handler: async (ctx, { bggId }) => {
    const g = await ctx.db
      .query("games")
      .withIndex("by_bgg_id", (q) => q.eq("bggId", bggId))
      .first();
    return g ? { _id: g._id, slug: g.slug, isStub: g.isStub === true } : null;
  },
});

/** Delete a game and everything under it (rulebooks, chunks, chats, messages). */
export const deleteGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    await requireAdmin(ctx);
    const game = await ctx.db.get("games", gameId);
    if (!game) return;

    // Rulebooks + their chunks + their storage + drafts.
    const rulebooks = await ctx.db
      .query("rulebooks")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .take(100);
    for (const rb of rulebooks) {
      const chunks = await ctx.db
        .query("chunks")
        .withIndex("by_rulebook", (q) => q.eq("rulebookId", rb._id))
        .take(1000);
      for (const c of chunks) await ctx.db.delete("chunks", c._id);
      await ctx.storage.delete(rb.storageId);
      await ctx.db.delete("rulebooks", rb._id);
    }

    // Chats + messages for this game (admin op — a filtered scan is acceptable).
    const chats = await ctx.db
      .query("chats")
      .filter((q) => q.eq(q.field("gameId"), gameId))
      .take(500);
    for (const chat of chats) {
      const msgs = await ctx.db
        .query("messages")
        .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
        .take(1000);
      for (const m of msgs) await ctx.db.delete("messages", m._id);
      await ctx.db.delete("chats", chat._id);
    }

    // Free cover + thumbnail blobs (dedupe — they may be the same storageId).
    const blobs = new Set<Id<"_storage">>();
    if (game.imageId) blobs.add(game.imageId);
    if (game.thumbnailId) blobs.add(game.thumbnailId);
    for (const id of blobs) await ctx.storage.delete(id);
    await ctx.db.delete("games", gameId);

    // If this was an expansion, recompute its parent's hasExpansions flag.
    if (game.isExpansion && game.parentId) {
      const sibling = await ctx.db
        .query("games")
        .withIndex("by_parent", (q) => q.eq("parentId", game.parentId))
        .first();
      await ctx.db.patch("games", game.parentId, {
        hasExpansions: sibling !== null,
      });
    }
  },
});
