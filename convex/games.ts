import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  internalAction,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { deleteMedia } from "./r2";
import { publicUrl } from "./lib/r2keys";
import { requireAdmin } from "./lib/auth";
import { slugify, slugifyUnique } from "./lib/slug";
import { buildSearchText } from "./lib/gameSearch";
import {
  sortKeys,
  isGameSort,
  DEFAULT_SORT,
  type GameSortKey,
} from "./lib/gameSort";
import { bggStatsValidator } from "./lib/bggStats";
import { coverUrls, thumbUrl } from "./lib/gameCover";
import { recordMessages } from "./lib/stats";

/** Resolve a game's cover URLs for the client (BGG CDN preferred, Convex blob
 *  fallback). Drops the server-only `searchText` (a large blob no client reads). */
async function withMedia(ctx: QueryCtx, game: Doc<"games">) {
  const { imageUrl, thumbnailUrl } = await coverUrls(ctx, game);
  const { searchText, ...rest } = game;
  void searchText;
  return { ...rest, imageUrl, thumbnailUrl };
}

export type GameWithMedia = Awaited<ReturnType<typeof withMedia>>;

/**
 * A trimmed projection for library/grid cards — only the fields GameCard /
 * GameListItem read, plus resolved media. Skips the heavy detail-only fields
 * (description, the full `bgg` blob, designer/category/mechanic arrays,
 * `similarIds`, …) to keep list-query egress small. The rating comes from the
 * denormalized `bggRating`, kept in sync with `bgg.rating`.
 */
export type GameCardData = {
  _id: Id<"games">;
  title: string;
  slug: string;
  year?: string;
  minPlayers?: number;
  maxPlayers?: number;
  minPlayTime?: number;
  maxPlayTime?: number;
  bggId?: string;
  bggRating?: number;
  imageUrl: string | null;
  thumbnailUrl: string | null;
};

async function withCardMedia(
  ctx: QueryCtx,
  game: Doc<"games">,
): Promise<GameCardData> {
  const { imageUrl, thumbnailUrl } = await coverUrls(ctx, game);
  return {
    _id: game._id,
    title: game.title,
    slug: game.slug,
    year: game.year,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
    minPlayTime: game.minPlayTime,
    maxPlayTime: game.maxPlayTime,
    bggId: game.bggId,
    bggRating: game.bggRating,
    imageUrl,
    thumbnailUrl,
  };
}

/** A rulebook enriched with a normalized `kind` and a signed download URL. */
async function rulebookWithMeta(ctx: QueryCtx, rb: Doc<"rulebooks">) {
  // Rulebook files are served from our public CDN (clean, cacheable URLs),
  // falling back to the legacy Convex blob until backfilled.
  const downloadUrl = rb.storageKey
    ? publicUrl(rb.storageKey)
    : rb.storageId
      ? await ctx.storage.getUrl(rb.storageId)
      : null;
  return {
    ...rb,
    kind: rb.kind ?? ("rulebook" as const),
    downloadUrl,
  };
}

export type RulebookWithMeta = Awaited<ReturnType<typeof rulebookWithMeta>>;


/**
 * Slugs of every indexable game detail page, for the sitemap — non-stub base
 * games AND expansions (both have their own detail page). No media, so it stays
 * cheap even at a few thousand rows.
 */
export const sitemapSlugs = query({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db
      .query("games")
      .withIndex("by_isStub_and_isExpansion", (q) => q.eq("isStub", false))
      .take(10000);
    return games.map((g) => ({
      slug: g.slug,
      updatedAt: g._creationTime,
      isExpansion: g.isExpansion,
    }));
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
        q.search("searchText", trimmed).eq("isStub", false),
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
 * Compact title matches for the nav search dropdown — a handful of rows with
 * just enough to render a suggestion (thumbnail + the players/time/year line).
 * Deliberately separate from `searchPaginated`: this runs on every (debounced)
 * keystroke, so it reads one short page and skips the heavy card projection.
 */
export const suggest = query({
  args: { term: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { term, limit }) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) return [];
    const max = Math.max(1, Math.min(limit ?? 8, 20));
    // Expansions are searchable too — a player looking for "Seafarers" should
    // find it. The UI tags them so they're not mistaken for the base game.
    const hits = await ctx.db
      .query("games")
      .withSearchIndex("search_text", (q) =>
        q.search("searchText", trimmed).eq("isStub", false),
      )
      .take(max * 3);

    // The full-text index is typo-tolerant, which for short queries drags in
    // unrelated games ("wall" → "ball"). Keep rows that contain every typed term
    // somewhere, then rank so name matches lead and publisher/designer-only
    // matches (e.g. other Stonemaier games for "stone age") trail.
    const terms = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
    const needle = trimmed.toLowerCase();
    const ranked = hits
      .filter((g) => {
        const hay = (g.searchText ?? g.title).toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      // A title that *starts* with what was typed beats one that merely contains
      // it, which beats a designer/publisher/category-only hit.
      .map((g) => {
        const title = g.title.toLowerCase();
        return {
          g,
          rank: title.startsWith(needle) ? 0 : title.includes(needle) ? 1 : 2,
        };
      })
      .sort((a, b) => a.rank - b.rank)
      .slice(0, max);

    return await Promise.all(
      ranked.map(async ({ g }) => {
        const { thumbnailUrl } = await coverUrls(ctx, g);
        return {
          _id: g._id,
          slug: g.slug,
          title: g.title,
          year: g.year ?? null,
          minPlayers: g.minPlayers ?? null,
          maxPlayers: g.maxPlayers ?? null,
          minPlayTime: g.minPlayTime ?? null,
          maxPlayTime: g.maxPlayTime ?? null,
          rating: g.bggRating ?? null,
          bggId: g.bggId ?? null,
          thumbUrl: thumbnailUrl,
          isExpansion: g.isExpansion,
        };
      }),
    );
  },
});



// ---------------------------------------------------------------------------
// Unified library browse — one query behind the /boardgames rows + /boardgames/all
// grid. Supports players / time / expansions / chat-ready plus genre (category)
// and mechanic filters and a search term. Genre/mechanic are array-contains,
// which Convex indexes can't express, so this scans base games (~a few hundred)
// and filters in JS; media is resolved only for the returned page.
// ---------------------------------------------------------------------------

const libraryFilterArgs = {
  term: v.optional(v.string()),
  players: v.optional(v.number()),
  time: v.optional(
    v.union(v.literal("quick"), v.literal("standard"), v.literal("epic")),
  ),
  hasExpansions: v.optional(v.boolean()),
  chatOnly: v.optional(v.boolean()),
  categories: v.optional(v.array(v.string())),
  mechanics: v.optional(v.array(v.string())),
};

type LibraryFilters = {
  term?: string;
  players?: number;
  time?: LibraryTime;
  hasExpansions?: boolean;
  chatOnly?: boolean;
  categories?: string[];
  mechanics?: string[];
};

/** True when the game has ANY of the selected values (empty selection = no filter). */
function hasAnyValue(gameVals: string[], selected: string[] | undefined): boolean {
  if (!selected || selected.length === 0) return true;
  const set = new Set(gameVals.map((v) => v.trim().toLowerCase()));
  return selected.some((s) => set.has(s.trim().toLowerCase()));
}

/** Games (base + expansions) matching every active library filter, newest first. */
/** When searching, how many top-relevance index hits to pull as the candidate
 *  set. Far cheaper than scanning the whole catalogue, and deep enough that the
 *  real matches for any term are covered. */
const SEARCH_CANDIDATES = 150;

async function filteredLibrary(
  ctx: QueryCtx,
  f: LibraryFilters,
  flagsReady: boolean,
): Promise<Doc<"games">[]> {
  const search = (f.term ?? "").trim();
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);

  // Candidate set. With a search term, pull the top relevance hits from the
  // full-text index — reads ~the top matches, NOT the whole catalogue (this was
  // a 2,000-full-doc scan on every search, the library's biggest read cost).
  // Without a term (genre/mechanic/chat-only filters), fall back to the bounded
  // scan. Expansions are included; only stubs are held back. Chat-only reads
  // just the flagged chat-ready set (much smaller than the catalogue).
  const flagChat = !!f.chatOnly && flagsReady;
  const base =
    search.length >= 2
      ? await ctx.db
          .query("games")
          .withSearchIndex("search_text", (q) => {
            const sq = q.search("searchText", search).eq("isStub", false);
            return flagChat ? sq.eq("chatReady", true) : sq;
          })
          .take(SEARCH_CANDIDATES)
      : flagChat
        ? await ctx.db
            .query("games")
            .withIndex("by_chat", (q) =>
              q.eq("isStub", false).eq("chatReady", true),
            )
            .order("desc")
            .take(2000)
        : await ctx.db
            .query("games")
            .withIndex("by_isStub_and_isExpansion", (q) => q.eq("isStub", false))
            .order("desc")
            .take(2000);
  // Pre-backfill fallback only; once flags exist the check is per-row.
  const chatIds =
    f.chatOnly && !flagsReady ? await chatEnabledBaseIds(ctx) : null;
  return base.filter((g) => {
    if (!matchesLibraryFilters(g, f.players, f.time, f.hasExpansions)) return false;
    if (flagChat && g.chatReady !== true) return false;
    if (chatIds && !chatIds.has(g._id)) return false;
    if (!hasAnyValue(g.categories, f.categories)) return false;
    if (!hasAnyValue(g.gameMechanics, f.mechanics)) return false;
    if (terms.length) {
      // Match anywhere in the blob (title + designers + publishers + …) so a
      // designer/publisher can still surface a game; the caller ranks name
      // matches ahead of these related ones.
      const hay = (g.searchText ?? g.title).toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

/** Games whose own title matches every term lead; publisher/designer-only
 *  matches (the "related" ones) keep their order but trail. Stable. */
function rankByNameMatch(
  games: Doc<"games">[],
  term: string | undefined,
): Doc<"games">[] {
  const terms = (term ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return games;
  const named = (g: Doc<"games">) => {
    const title = g.title.toLowerCase();
    return terms.every((w) => title.includes(w));
  };
  return [...games.filter(named), ...games.filter((g) => !named(g))];
}

/** In-memory sort for the library scan (all browse/search paths). */
function sortLibrary(
  games: Doc<"games">[],
  sort: GameSortKey,
): Doc<"games">[] {
  const num = (v?: number) => v ?? -Infinity;
  const arr = [...games];
  switch (sort) {
    case "updated":
      arr.sort((a, b) => num(b.contentUpdatedAt) - num(a.contentUpdatedAt));
      break;
    case "title":
      arr.sort((a, b) =>
        (a.sortTitle ?? a.title.toLowerCase()).localeCompare(
          b.sortTitle ?? b.title.toLowerCase(),
        ),
      );
      break;
    case "year":
      arr.sort((a, b) => num(b.yearNum) - num(a.yearNum));
      break;
    case "weight":
      arr.sort((a, b) => num(b.bggWeight) - num(a.bggWeight));
      break;
    case "rated":
      arr.sort((a, b) => num(b.bggRatingCount) - num(a.bggRatingCount));
      break;
    case "newest":
      arr.sort((a, b) => b._creationTime - a._creationTime);
      break;
    case "rating":
    default:
      arr.sort((a, b) => num(b.bggRating) - num(a.bggRating));
      break;
  }
  return arr;
}

/**
 * The non-stub library query (base games + expansions) for the fast paginated
 * browse path, ordered by the chosen sort. Each branch uses a dedicated
 * (isStub, <key>) index so pagination reads ~one page — no scan.
 */
function libraryBase(ctx: QueryCtx, sort: GameSortKey, chatOnly: boolean) {
  if (chatOnly) return chatLibraryBase(ctx, sort);
  const q = ctx.db.query("games");
  switch (sort) {
    case "updated":
      return q
        .withIndex("by_lib_updated", (i) => i.eq("isStub", false))
        .order("desc");
    case "title":
      return q
        .withIndex("by_lib_title", (i) => i.eq("isStub", false))
        .order("asc");
    case "year":
      return q
        .withIndex("by_lib_year", (i) => i.eq("isStub", false))
        .order("desc");
    case "weight":
      return q
        .withIndex("by_lib_weight", (i) => i.eq("isStub", false))
        .order("desc");
    case "rated":
      return q
        .withIndex("by_lib_rated", (i) => i.eq("isStub", false))
        .order("desc");
    case "newest":
      return q
        .withIndex("by_isStub", (i) => i.eq("isStub", false))
        .order("desc");
    case "rating":
    default:
      return q
        .withIndex("by_lib_rating", (i) => i.eq("isStub", false))
        .order("desc");
  }
}

/** libraryBase, restricted to chat-ready base games via the by_chat_* indexes. */
function chatLibraryBase(ctx: QueryCtx, sort: GameSortKey) {
  const q = ctx.db.query("games");
  switch (sort) {
    case "updated":
      return q
        .withIndex("by_chat_updated", (i) => i.eq("isStub", false).eq("chatReady", true))
        .order("desc");
    case "title":
      return q
        .withIndex("by_chat_title", (i) => i.eq("isStub", false).eq("chatReady", true))
        .order("asc");
    case "year":
      return q
        .withIndex("by_chat_year", (i) => i.eq("isStub", false).eq("chatReady", true))
        .order("desc");
    case "weight":
      return q
        .withIndex("by_chat_weight", (i) => i.eq("isStub", false).eq("chatReady", true))
        .order("desc");
    case "rated":
      return q
        .withIndex("by_chat_rated", (i) => i.eq("isStub", false).eq("chatReady", true))
        .order("desc");
    case "newest":
      return q
        .withIndex("by_chat", (i) => i.eq("isStub", false).eq("chatReady", true))
        .order("desc");
    case "rating":
    default:
      return q
        .withIndex("by_chat_rating", (i) => i.eq("isStub", false).eq("chatReady", true))
        .order("desc");
  }
}

/** Filters that can't be index-served (array-contains genre/mechanic, a
 *  full-text search, or chat-only before the flags are backfilled) and so need
 *  the bounded in-memory scan instead. */
function needsLibraryScan(f: LibraryFilters, flagsReady: boolean): boolean {
  return (
    (f.categories?.length ?? 0) > 0 ||
    (f.mechanics?.length ?? 0) > 0 ||
    (!!f.chatOnly && !flagsReady) ||
    (f.term ?? "").trim().length >= 2
  );
}

/**
 * Paginated library browse + search (base games + expansions). Plain browse
 * (players / time / expansions filters, any sort) is index-backed and reads ~one
 * page; genre / mechanic / chat / search fall back to a bounded in-memory scan.
 */
export const libraryGames = query({
  args: {
    paginationOpts: paginationOptsValidator,
    sort: v.optional(v.string()),
    ...libraryFilterArgs,
  },
  handler: async (ctx, { paginationOpts, sort: sortArg, ...f }) => {
    const sort: GameSortKey = isGameSort(sortArg ?? "")
      ? (sortArg as GameSortKey)
      : DEFAULT_SORT;

    const flagsReady = f.chatOnly ? await chatFlagsReady(ctx) : false;

    // Plain browse (incl. chat-only) → the fast index-ordered path (~one page).
    if (!needsLibraryScan(f, flagsReady)) {
      const needsFilter =
        f.players != null || f.time != null || !!f.hasExpansions;
      const base = libraryBase(ctx, sort, !!f.chatOnly);
      const q = needsFilter
        ? base.filter((e) => {
            const conds = [];
            if (f.players != null) {
              conds.push(
                e.and(
                  e.lte(e.field("minPlayers"), f.players),
                  e.gte(e.field("maxPlayers"), f.players),
                ),
              );
            }
            if (f.time === "quick") conds.push(e.lte(e.field("maxPlayTime"), 30));
            else if (f.time === "standard")
              conds.push(
                e.and(
                  e.gt(e.field("maxPlayTime"), 30),
                  e.lte(e.field("maxPlayTime"), 90),
                ),
              );
            else if (f.time === "epic")
              conds.push(e.gt(e.field("maxPlayTime"), 90));
            if (f.hasExpansions) conds.push(e.eq(e.field("hasExpansions"), true));
            return e.and(...conds);
          })
        : base;
      const result = await q.paginate(paginationOpts);
      return {
        ...result,
        page: await Promise.all(result.page.map((g) => withCardMedia(ctx, g))),
      };
    }

    // Genre / mechanic / chat / search → bounded in-memory scan (offset cursor).
    // When searching, name matches lead and publisher/designer-only matches
    // trail, each group kept in the chosen sort order.
    const filtered = rankByNameMatch(
      sortLibrary(await filteredLibrary(ctx, f, flagsReady), sort),
      f.term,
    );
    const offset = Number(paginationOpts.cursor ?? "0") || 0;
    const end = offset + paginationOpts.numItems;
    const slice = filtered.slice(offset, end);
    return {
      page: await Promise.all(slice.map((g) => withCardMedia(ctx, g))),
      isDone: end >= filtered.length,
      continueCursor: String(end),
    };
  },
});

/** Count for the current library filters (drives the header total). */
export const libraryCount = query({
  args: libraryFilterArgs,
  handler: async (ctx, f) => {
    // The unfiltered total is the common case, changes slowly, and is otherwise
    // a 2,000-doc scan that re-runs on every game write for every viewer. Read
    // the denormalized count (refreshed daily by recomputeSimilarGames) instead;
    // its read-set is one small doc, so it barely ever re-executes. Any active
    // filter still needs the exact scan.
    // Same for the default public view (chat-ready only): the live
    // chatReadyCount kept by refreshChatReady.
    const unfiltered =
      !f.term?.trim() &&
      f.players == null &&
      f.time == null &&
      !f.hasExpansions &&
      !f.categories?.length &&
      !f.mechanics?.length;
    const stats = await ctx.db.query("catalogueStats").first();
    const flagsReady = stats?.chatReadyBackfilledAt != null;
    if (unfiltered && stats) {
      if (!f.chatOnly) return stats.baseGameCount;
      if (flagsReady && stats.chatReadyCount != null) return stats.chatReadyCount;
    }
    // Not populated yet, or real filters active — count the (bounded) scan.
    const filtered = await filteredLibrary(ctx, f, flagsReady);
    return filtered.length;
  },
});

/** The 40 most common values of a string-array field across `games`, most
 *  common first (ties A–Z). Shared by filterFacets and the daily recompute. */
function topFacets(
  games: Doc<"games">[],
  pick: (g: Doc<"games">) => string[],
): string[] {
  const counts = new Map<string, number>();
  for (const g of games) {
    for (const raw of pick(g)) {
      const label = raw.trim();
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 40)
    .map(([label]) => label);
}

/** Distinct genres (categories) + mechanics for the filter drawer, most common
 *  first. Reads the lists denormalized onto catalogueStats by the daily
 *  recomputeSimilarGames; scans base games only until that has run once. */
export const filterFacets = query({
  args: {},
  handler: async (ctx) => {
    const stats = await ctx.db.query("catalogueStats").first();
    if (stats?.facetCategories && stats.facetMechanics) {
      return {
        categories: stats.facetCategories,
        mechanics: stats.facetMechanics,
      };
    }
    const base = await ctx.db
      .query("games")
      .withIndex("by_isStub_and_isExpansion", (q) =>
        q.eq("isStub", false).eq("isExpansion", false),
      )
      .take(2000);
    return {
      categories: topFacets(base, (g) => g.categories),
      mechanics: topFacets(base, (g) => g.gameMechanics),
    };
  },
});

// ---------------------------------------------------------------------------
// Chat-ready flag. `games.chatReady` is denormalized onto the family's base game
// so the default (chat-ready) library browse paginates off the by_chat_* indexes
// instead of scanning the catalogue + every rulebook on each view.
// ---------------------------------------------------------------------------

/** A rulebook that makes its game chattable: ingested, and not a download add-on. */
function isChatRulebook(rb: Doc<"rulebooks">): boolean {
  return rb.isIngested && (rb.kind ?? "rulebook") !== "download";
}

/** The family base a game's rulebooks count toward. */
function familyBaseId(g: Doc<"games">): Id<"games"> {
  return g.isExpansion && g.parentId ? g.parentId : g._id;
}

/** Ground truth, derived from rulebooks: chat-ready base ids → base doc.
 *  Scans rulebooks (~a few hundred) — used for the reconcile and as the
 *  pre-backfill fallback, never on the hot path once flags are populated. */
async function chatReadyFromRulebooks(
  ctx: QueryCtx,
): Promise<Map<Id<"games">, Doc<"games">>> {
  const rulebooks = await ctx.db.query("rulebooks").collect();
  const withRules = new Set<Id<"games">>();
  for (const rb of rulebooks) if (isChatRulebook(rb)) withRules.add(rb.gameId);
  const bases = new Map<Id<"games">, Doc<"games">>();
  for (const gid of withRules) {
    const g = await ctx.db.get("games", gid);
    if (!g) continue;
    const baseId = familyBaseId(g);
    if (bases.has(baseId)) continue;
    const base = baseId === g._id ? g : await ctx.db.get("games", baseId);
    if (base) bases.set(baseId, base);
  }
  return bases;
}

/** True once backfillChatReady has populated the flags. Until then, readers
 *  fall back to the rulebook scan so a fresh deploy is never wrong. */
async function chatFlagsReady(ctx: QueryCtx): Promise<boolean> {
  const stats = await ctx.db.query("catalogueStats").first();
  return stats?.chatReadyBackfilledAt != null;
}

/** Every flagged game (any stub state), via the by_chat index. */
async function flaggedChatReady(ctx: QueryCtx): Promise<Doc<"games">[]> {
  const out: Doc<"games">[] = [];
  for (const isStub of [false, true, undefined]) {
    out.push(
      ...(await ctx.db
        .query("games")
        .withIndex("by_chat", (q) =>
          q.eq("isStub", isStub).eq("chatReady", true),
        )
        .take(2000)),
    );
  }
  return out;
}

/**
 * Base-game ids whose family (the base game itself or any of its expansions)
 * has at least one ingested rulebook — i.e. the games Meepletron can actually
 * chat about. "download" add-ons don't count. Reads the denormalized flag.
 */
export async function chatEnabledBaseIds(
  ctx: QueryCtx,
): Promise<Set<Id<"games">>> {
  if (!(await chatFlagsReady(ctx))) {
    return new Set((await chatReadyFromRulebooks(ctx)).keys());
  }
  return new Set((await flaggedChatReady(ctx)).map((g) => g._id));
}

/** Does any game in this base's family have a chat rulebook? Indexed reads only. */
async function familyHasChatRules(
  ctx: QueryCtx,
  baseId: Id<"games">,
): Promise<boolean> {
  const expansions = await ctx.db
    .query("games")
    .withIndex("by_parent", (q) => q.eq("parentId", baseId))
    .take(200);
  const ids = [baseId, ...expansions.filter((e) => e.isExpansion).map((e) => e._id)];
  for (const id of ids) {
    const rbs = await ctx.db
      .query("rulebooks")
      .withIndex("by_game", (q) => q.eq("gameId", id))
      .take(50);
    if (rbs.some(isChatRulebook)) return true;
  }
  return false;
}

/** Set a game's flag; on a flip, nudge the live count (non-stubs only — that's
 *  the library set). The daily reconcile corrects any drift. */
async function setChatReady(
  ctx: MutationCtx,
  g: Doc<"games">,
  ready: boolean,
): Promise<void> {
  if ((g.chatReady === true) === ready) return;
  await ctx.db.patch("games", g._id, { chatReady: ready ? true : undefined });
  if (g.isStub) return;
  const stats = await ctx.db.query("catalogueStats").first();
  if (!stats || stats.chatReadyCount == null) return;
  await ctx.db.patch("catalogueStats", stats._id, {
    chatReadyCount: Math.max(0, stats.chatReadyCount + (ready ? 1 : -1)),
  });
}

/**
 * Recompute the chat-ready flag for a game's family. Call in the SAME mutation
 * as any write that can change it: a rulebook ingested / deleted, or a game's
 * parentId / isExpansion changing (call for the old parent too).
 */
export async function refreshChatReady(
  ctx: MutationCtx,
  gameId: Id<"games">,
): Promise<void> {
  const g = await ctx.db.get("games", gameId);
  if (!g) return;
  const baseId = familyBaseId(g);
  // An expansion never carries the flag itself (e.g. a base that was re-parented).
  if (baseId !== g._id) await setChatReady(ctx, g, false);
  const base = baseId === g._id ? g : await ctx.db.get("games", baseId);
  if (!base) return;
  await setChatReady(ctx, base, await familyHasChatRules(ctx, baseId));
}

/** Rebuild every flag + the count from rulebooks; marks the flags as populated. */
async function reconcileChatReady(ctx: MutationCtx) {
  const want = await chatReadyFromRulebooks(ctx);
  const flagged = await flaggedChatReady(ctx);
  const flaggedIds = new Set(flagged.map((g) => g._id));
  let changed = 0;
  for (const g of flagged) {
    if (!want.has(g._id)) {
      await ctx.db.patch("games", g._id, { chatReady: undefined });
      changed++;
    }
  }
  for (const [id] of want) {
    if (!flaggedIds.has(id)) {
      await ctx.db.patch("games", id, { chatReady: true });
      changed++;
    }
  }
  let count = 0;
  for (const g of want.values()) if (g.isStub === false) count++;
  const now = Date.now();
  const stats = await ctx.db.query("catalogueStats").first();
  if (stats) {
    await ctx.db.patch("catalogueStats", stats._id, {
      chatReadyCount: count,
      chatReadyBackfilledAt: now,
    });
  } else {
    await ctx.db.insert("catalogueStats", {
      baseGameCount: 0,
      chatReadyCount: count,
      chatReadyBackfilledAt: now,
      updatedAt: now,
    });
  }
  return { chatReady: count, changed };
}

/**
 * Populate / repair the chat-ready flags. Run once after deploying them:
 *   npx convex run games:backfillChatReady          (dev)
 *   npx convex run --prod games:backfillChatReady   (prod)
 * Also re-run daily by recomputeSimilarGames as a drift safety net.
 */
export const backfillChatReady = internalMutation({
  args: {},
  handler: async (ctx) => await reconcileChatReady(ctx),
});

type LibraryTime = "quick" | "standard" | "epic";

/** JS mirror of libraryGames' players/time/expansions index filter. */
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



// ---------------------------------------------------------------------------
// Similar games. Ranked by shared mechanics/categories (+ a small designer
// bonus). The ranking is denormalized onto each base game (games.similarIds) by
// a daily cron so the detail page reads ~6 ids instead of scanning the whole
// catalogue on every view.
// ---------------------------------------------------------------------------

type SimFeat = {
  id: Id<"games">;
  cats: Set<string>;
  mechs: Set<string>;
  designers: Set<string>;
};

const normStr = (s: string) => s.trim().toLowerCase();

function toSimFeat(g: Doc<"games">): SimFeat {
  return {
    id: g._id,
    cats: new Set(g.categories.map(normStr)),
    mechs: new Set(g.gameMechanics.map(normStr)),
    designers: new Set(g.designers.map(normStr)),
  };
}

/** Best-first similar base-game ids for `base`, excluding itself. */
function rankSimilar(base: SimFeat, others: SimFeat[], limit: number): Id<"games">[] {
  if (base.cats.size === 0 && base.mechs.size === 0) return [];
  const scored: { id: Id<"games">; score: number }[] = [];
  for (const c of others) {
    if (c.id === base.id) continue;
    let score = 0;
    for (const x of c.mechs) if (base.mechs.has(x)) score += 2;
    for (const x of c.cats) if (base.cats.has(x)) score += 1.5;
    for (const x of c.designers) if (base.designers.has(x)) score += 1;
    if (score > 0) scored.push({ id: c.id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.id);
}

/**
 * Games similar to `gameId`. Reads the precomputed `similarIds` (daily cron) and
 * fetches just those — a handful of doc reads instead of a full-catalogue scan.
 * Falls back to the scan only for games not yet computed (e.g. brand-new ones).
 */
export const similarGames = query({
  args: { gameId: v.id("games"), limit: v.optional(v.number()) },
  handler: async (ctx, { gameId, limit }) => {
    const game = await ctx.db.get("games", gameId);
    if (!game) return [];
    const base =
      game.isExpansion && game.parentId
        ? ((await ctx.db.get("games", game.parentId)) ?? game)
        : game;
    const cap = Math.max(1, Math.min(limit ?? 6, 12));

    // Fast path: precomputed list.
    if (base.similarIds) {
      const docs = await Promise.all(
        base.similarIds.slice(0, cap).map((id) => ctx.db.get("games", id)),
      );
      const valid = docs.filter(
        (g): g is Doc<"games"> => !!g && !g.isStub && !g.isExpansion,
      );
      // The rail renders GameCards — return the lean card shape, not full docs.
      return await Promise.all(valid.map((g) => withCardMedia(ctx, g)));
    }

    // Fallback (not yet computed): scan the catalogue once.
    const candidates = await ctx.db
      .query("games")
      .withIndex("by_isStub_and_isExpansion", (q) =>
        q.eq("isStub", false).eq("isExpansion", false),
      )
      .take(2000);
    const ids = rankSimilar(toSimFeat(base), candidates.map(toSimFeat), cap);
    const byId = new Map(candidates.map((c) => [c._id, c] as const));
    const picked = ids
      .map((id) => byId.get(id))
      .filter((g): g is Doc<"games"> => !!g);
    return await Promise.all(picked.map((g) => withCardMedia(ctx, g)));
  },
});

/**
 * Recompute + store `similarIds` for every base game. Reads the catalogue once
 * and scores in memory (O(n²), fine for the few hundred base games), so the
 * per-view scan becomes a once-a-day job. Run by a cron; also runnable manually.
 */
/** Same ids in the same order — lets us skip a no-op write. */
function sameIds(a: Id<"games">[] | undefined, b: Id<"games">[]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export const recomputeSimilarGames = internalMutation({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db
      .query("games")
      .withIndex("by_isStub_and_isExpansion", (q) =>
        q.eq("isStub", false).eq("isExpansion", false),
      )
      .take(2000);

    // Denormalize the catalogue totals off the back of this scan, so the library
    // header (games.libraryCount) and the admin dashboard (admin.dashboardStats)
    // read one small doc instead of re-scanning every game on every view + write.
    const expansionCount = (
      await ctx.db
        .query("games")
        .withIndex("by_isExpansion", (q) => q.eq("isExpansion", true))
        .take(20000)
    ).length;
    // Filter-drawer facets off the same scan (games.filterFacets reads them).
    const facetCategories = topFacets(games, (g) => g.categories);
    const facetMechanics = topFacets(games, (g) => g.gameMechanics);
    const stats = await ctx.db.query("catalogueStats").first();
    if (stats) {
      await ctx.db.patch("catalogueStats", stats._id, {
        baseGameCount: games.length,
        expansionCount,
        facetCategories,
        facetMechanics,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("catalogueStats", {
        baseGameCount: games.length,
        expansionCount,
        facetCategories,
        facetMechanics,
        updatedAt: Date.now(),
      });
    }

    // Drift safety net for the chat-ready flags + count (cheap: rulebook scan
    // plus a diff, writes only what changed).
    await reconcileChatReady(ctx);

    const feats = games.map(toSimFeat);
    let updated = 0;
    for (let i = 0; i < games.length; i++) {
      const ids = rankSimilar(feats[i], feats, 12);
      // Only write when the ranking actually changed — on a day with no
      // catalogue change this patches ~nothing instead of all ~2,000 games.
      if (!sameIds(games[i].similarIds, ids)) {
        await ctx.db.patch("games", games[i]._id, { similarIds: ids });
        updated++;
      }
    }
    return { scanned: games.length, updated };
  },
});

/** Assemble a game detail: the game (with media), parent, expansions, rulebooks. */
async function gameDetail(ctx: QueryCtx, game: Doc<"games">) {
  const [expansions, rulebookDocs, parentDoc, content] = await Promise.all([
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
    ctx.db
      .query("gameContent")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .first(),
  ]);
  return {
    ...(await withMedia(ctx, game)),
    // Description lives in the gameContent sidecar; fall back to the game doc
    // for rows not yet backfilled.
    description: content?.description ?? game.description,
    // For expansions, the base game they belong to (null for base games).
    parent: parentDoc ? await withMedia(ctx, parentDoc) : null,
    // Lean rows: the detail page's Expansions list only shows a cover + title
    // linking to the slug — not the full doc.
    expansions: await Promise.all(
      expansions.map(async (e) => ({
        _id: e._id,
        slug: e.slug,
        title: e.title,
        ...(await coverUrls(ctx, e)),
      })),
    ),
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
 * A base game's expansions, for the log-play wizard's checklist. Pass any game
 * in the family — an expansion resolves to its parent first, since a play is
 * always logged against the base game.
 */
export const expansionsOf = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get("games", gameId);
    if (!game) return [];
    const baseId = game.isExpansion && game.parentId ? game.parentId : game._id;
    const rows = await ctx.db
      .query("games")
      .withIndex("by_parent", (q) => q.eq("parentId", baseId))
      .take(100);
    rows.sort((a, b) =>
      (a.sortTitle ?? a.title.toLowerCase()).localeCompare(
        b.sortTitle ?? b.title.toLowerCase(),
      ),
    );
    return await Promise.all(
      rows.map(async (e) => ({
        _id: e._id,
        title: e.title,
        bggId: e.bggId ?? null,
        year: e.year ?? null,
        thumbUrl: (await coverUrls(ctx, e)).thumbnailUrl,
      })),
    );
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

/** One row of the admin games list — just the fields the row, the filters and
 *  the ingest badges need, and nothing heavy (no description, no searchText). */
async function adminRow(ctx: QueryCtx, g: Doc<"games">) {
  const rulebooks = await ctx.db
    .query("rulebooks")
    .withIndex("by_game", (q) => q.eq("gameId", g._id))
    // Only chat rulebooks are ingestable; "download" add-ons are not.
    .collect();
  const files = rulebooks.filter((r) => (r.kind ?? "rulebook") !== "download");
  return {
    _id: g._id,
    title: g.title,
    slug: g.slug,
    isExpansion: g.isExpansion,
    isStub: !!g.isStub,
    thumbnailUrl: await thumbUrl(ctx, g),
    fileCount: files.length,
    ingestedCount: files.filter((r) => r.isIngested).length,
  };
}

/**
 * The admin games index: every game (base + expansions), newest first, which
 * the page then filters and pages through client-side. Searching is *not*
 * client-side — it goes through `adminSearch`, because this list is capped.
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
    return await Promise.all(games.map((g) => adminRow(ctx, g)));
  },
});

/**
 * Admin search across the whole catalogue.
 *
 * Runs on the server, through the same `search_text` index the public search
 * uses, so the admin list turns up what players see: matches on designers,
 * publishers, categories and mechanics as well as the title, ranked by
 * relevance and tolerant of a typo. The old client-side filter could only
 * substring-match the title/slug of the 1000 rows `adminList` had loaded, so
 * anything older than that window was unfindable.
 *
 * Stubs are searched too (the admin list hides them, but they're exactly what
 * you need to find in order to promote one). They carry no `searchText` by
 * design, so they can't come from the full-text index — hence the separate
 * title-prefix pass over the stub rows.
 */
export const adminSearch = query({
  args: { term: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { term, limit }) => {
    await requireAdmin(ctx);
    const trimmed = term.trim();
    if (!trimmed) return [];
    const max = Math.max(1, Math.min(limit ?? 100, 500));

    const hits = await ctx.db
      .query("games")
      .withSearchIndex("search_text", (q) =>
        q.search("searchText", trimmed).eq("isStub", false),
      )
      .take(max * 3);

    // Same relevance guard as `searchPaginated`: the index is typo-tolerant,
    // which on short queries drags in unrelated games ("wall" -> "ball"). Keep
    // rows that contain every typed term somewhere. The slug is part of the
    // haystack so admin can still paste one in, as the old filter allowed.
    const terms = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (hay: string) => terms.every((t) => hay.includes(t));
    const found = hits.filter((g) =>
      matches(`${g.searchText ?? ""} ${g.title} ${g.slug}`.toLowerCase()),
    );

    // Stubs, by title prefix (an index range, so this stays cheap however many
    // stubs the collection syncs have piled up).
    const prefix = trimmed.toLowerCase();
    const stubs = await ctx.db
      .query("games")
      .withIndex("by_lib_title", (q) =>
        q
          .eq("isStub", true)
          .gte("sortTitle", prefix)
          .lt("sortTitle", prefix + "\uffff"),
      )
      .take(50);

    return await Promise.all(
      [...found, ...stubs].slice(0, max).map((g) => adminRow(ctx, g)),
    );
  },
});

/**
 * Every base game as a `{ _id, title, year }` option, for the "Base game"
 * picker on the admin game form. Title-sorted and media-free: the picker only
 * renders names, but it has to cover the whole catalogue — any base game can be
 * an expansion's parent, and a picker that omits one silently blanks itself.
 */
export const baseGameOptions = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const games = await ctx.db
      .query("games")
      // Title order comes from the index, so the picker is A-Z for free. The
      // cap is a backstop against an unbounded read; the catalogue is far
      // under it, and a base game past it could still be set via BGG fill.
      .withIndex("by_lib_title", (q) => q.eq("isStub", false))
      .take(5000);
    return games
      .filter((g) => !g.isExpansion)
      .map((g) => ({ _id: g._id, title: g.title, year: g.year }));
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

/** Nudge the denormalized catalogue count on a base-game add/remove so the
 *  library header stays live between reconciling recomputes. No-op until the
 *  count doc exists (recomputeSimilarGames seeds + reconciles it). */
async function adjustBaseGameCount(
  ctx: MutationCtx,
  delta: number,
): Promise<void> {
  const stats = await ctx.db.query("catalogueStats").first();
  if (!stats) return;
  await ctx.db.patch("catalogueStats", stats._id, {
    baseGameCount: Math.max(0, stats.baseGameCount + delta),
    updatedAt: Date.now(),
  });
}

/** Upsert a game's detail-only description into the gameContent sidecar, so it
 *  stays off the hot `games` doc that card/list reads pay for. */
async function setGameDescription(
  ctx: MutationCtx,
  gameId: Id<"games">,
  description: string | undefined,
): Promise<void> {
  const existing = await ctx.db
    .query("gameContent")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .first();
  if (existing) {
    await ctx.db.patch("gameContent", existing._id, { description });
  } else if (description !== undefined) {
    await ctx.db.insert("gameContent", { gameId, description });
  }
}

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
      // description lives in the gameContent sidecar (set below), not here.
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
      ...sortKeys({ title, year: args.year, bgg: args.bgg }),
      contentUpdatedAt: Date.now(),
    });
    await setGameDescription(ctx, gameId, args.description);
    // A new non-expansion game joins the library — keep the cached total live.
    if (!args.isExpansion) await adjustBaseGameCount(ctx, 1);
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
    // Description is stored in the gameContent sidecar, not on the game doc.
    const { description, ...gameArgs } = rest;
    const patch: Record<string, unknown> = { ...gameArgs };
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
    Object.assign(
      patch,
      sortKeys({
        title: (patch.title as string | undefined) ?? game.title,
        year: (rest.year as string | undefined) ?? game.year,
        bgg: rest.bgg ?? game.bgg,
      }),
    );
    patch.contentUpdatedAt = Date.now();
    await ctx.db.patch("games", gameId, patch);
    if (description !== undefined) {
      await setGameDescription(ctx, gameId, description);
    }

    // A stub promoted to a real (non-expansion) game joins the library — bump
    // the cached total so it stays live between reconciling recomputes.
    if (game.isStub && !(rest.isExpansion ?? game.isExpansion)) {
      await adjustBaseGameCount(ctx, 1);
    }

    // Re-parenting moves this game's rulebooks to a different family.
    if (
      (rest.isExpansion !== undefined && rest.isExpansion !== game.isExpansion) ||
      (rest.parentId !== undefined && rest.parentId !== game.parentId)
    ) {
      if (game.parentId) await refreshChatReady(ctx, game.parentId);
      await refreshChatReady(ctx, gameId);
    }

    // Newly-set BGG id: adopt the collection rows that were waiting for it.
    if (rest.bggId && rest.bggId !== game.bggId) {
      await ctx.scheduler.runAfter(0, internal.bggSync.relinkGameToBggRows, {
        gameId,
        bggId: rest.bggId,
      });
    }
  },
});

/**
 * Attach a stored R2 cover to a game. Called by the `images.ts` actions, which
 * compress + `r2.store` the blob (content already validated) before handing us
 * the keys. Frees the previous cover/thumbnail (R2 key or legacy Convex blob).
 */
export const setGameImage = mutation({
  args: {
    gameId: v.id("games"),
    storageKey: v.string(),
    // Optional smaller crop for grids/lists; falls back to the cover.
    thumbnailKey: v.optional(v.string()),
  },
  handler: async (ctx, { gameId, storageKey, thumbnailKey }) => {
    await requireAdmin(ctx);
    const game = await ctx.db.get("games", gameId);
    if (!game) throw new Error("Game not found");

    const newThumbKey = thumbnailKey ?? storageKey;
    // Free the previous cover + thumbnail, but never the keys we're about to
    // reference (cover/thumb can be the same key). Handles legacy blobs too.
    if (game.imageKey && game.imageKey !== storageKey && game.imageKey !== newThumbKey) {
      await deleteMedia(ctx, game.imageKey, null);
    }
    if (
      game.thumbnailKey &&
      game.thumbnailKey !== storageKey &&
      game.thumbnailKey !== newThumbKey &&
      game.thumbnailKey !== game.imageKey
    ) {
      await deleteMedia(ctx, game.thumbnailKey, null);
    }
    // Legacy blobs (pre-migration) — free them on first re-cover.
    const staleBlobs = new Set<Id<"_storage">>();
    if (game.imageId) staleBlobs.add(game.imageId);
    if (game.thumbnailId) staleBlobs.add(game.thumbnailId);
    for (const id of staleBlobs) await ctx.storage.delete(id);

    await ctx.db.patch("games", gameId, {
      imageKey: storageKey,
      thumbnailKey: newThumbKey,
      // Clear legacy blob pointers now that the R2 copy is canonical.
      imageId: undefined,
      thumbnailId: undefined,
      contentUpdatedAt: Date.now(),
    });
  },
});

/** A game's current slug — used by the image actions to build R2 object keys
 *  (folders are organised by game slug, never id). */
export const slugOf = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<string | null> => {
    const g = await ctx.db.get("games", gameId);
    return g?.slug ?? null;
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
/**
 * One-off backfill of the denormalized sort keys on games created before they
 * existed. Batched + idempotent (only touches rows still missing sortTitle) —
 * re-run until it reports done.
 */
export const backfillSortKeys = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("games")
      .filter((q) => q.eq(q.field("sortTitle"), undefined))
      .take(400);
    for (const g of rows) {
      await ctx.db.patch("games", g._id, {
        ...sortKeys({ title: g.title, year: g.year, bgg: g.bgg }),
      });
    }
    return { patched: rows.length, done: rows.length < 400 };
  },
});

export const applyStubEnrichment = internalMutation({
  args: {
    gameId: v.id("games"),
    meta: enrichMetaValidator,
    bgg: v.optional(bggStatsValidator),
    imageKey: v.optional(v.string()),
    thumbnailKey: v.optional(v.string()),
    bggImageUrl: v.optional(v.string()),
    bggThumbUrl: v.optional(v.string()),
    // Set from the authoritative /thing item type + its inbound base-game link.
    isExpansion: v.optional(v.boolean()),
    parentId: v.optional(v.id("games")),
  },
  handler: async (
    ctx,
    {
      gameId,
      meta,
      bgg,
      imageKey,
      thumbnailKey,
      bggImageUrl,
      bggThumbUrl,
      isExpansion,
      parentId,
    },
  ) => {
    const game = await ctx.db.get("games", gameId);
    if (!game || !game.isStub) {
      // Drop objects stored speculatively before we knew we'd skip.
      if (imageKey) await deleteMedia(ctx, imageKey, null);
      if (thumbnailKey && thumbnailKey !== imageKey) {
        await deleteMedia(ctx, thumbnailKey, null);
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
      // description goes to the gameContent sidecar (set below), not here.
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
      ...sortKeys({ title, year: meta.year ?? game.year, bgg: bgg ?? game.bgg }),
    };
    if (bgg) patch.bgg = bgg;
    if (imageKey) {
      patch.imageKey = imageKey;
      patch.thumbnailKey = thumbnailKey ?? imageKey;
    }
    if (bggImageUrl) patch.bggImageUrl = bggImageUrl;
    if (bggThumbUrl) patch.bggThumbUrl = bggThumbUrl;
    if (isExpansion !== undefined) patch.isExpansion = isExpansion;
    if (parentId) {
      patch.parentId = parentId;
      const parent = await ctx.db.get("games", parentId);
      if (parent && !parent.hasExpansions) {
        await ctx.db.patch("games", parentId, { hasExpansions: true });
      }
    }
    await ctx.db.patch("games", gameId, patch);
    await setGameDescription(ctx, gameId, meta.description);
    if (isExpansion !== undefined || parentId) {
      if (game.parentId) await refreshChatReady(ctx, game.parentId);
      await refreshChatReady(ctx, gameId);
    }
  },
});

/**
 * One-time, idempotent, resumable migration: move each game's `description` into
 * the gameContent sidecar and clear it off the game doc, so card/list reads stop
 * paying for it. Safe to run while serving traffic — gameDetail falls back to
 * the game doc for any row not yet moved. Drive it with the action below:
 *
 *   npx convex run games:backfillGameContentAll        (dev)
 *   npx convex run games:backfillGameContentAll --prod  (prod)
 */
export const backfillGameContentPage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const res = await ctx.db.query("games").paginate({ numItems: 200, cursor });
    let moved = 0;
    for (const g of res.page) {
      if (g.description === undefined) continue;
      await setGameDescription(ctx, g._id, g.description);
      await ctx.db.patch("games", g._id, { description: undefined });
      moved++;
    }
    return { moved, isDone: res.isDone, cursor: res.continueCursor };
  },
});

export const backfillGameContentAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ moved: number; pages: number }> => {
    let cursor: string | null = null;
    let moved = 0;
    let pages = 0;
    for (;;) {
      const r: { moved: number; isDone: boolean; cursor: string } =
        await ctx.runMutation(internal.games.backfillGameContentPage, {
          cursor,
        });
      moved += r.moved;
      pages++;
      if (r.isDone) break;
      cursor = r.cursor;
    }
    return { moved, pages };
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
      ...sortKeys({ title }),
    });
    return { gameId, needsEnrich: true };
  },
});

/** BGG ids for a set of games, for the batched stats refresh. */
export const bggIdsFor = internalQuery({
  args: { gameIds: v.array(v.id("games")) },
  handler: async (ctx, { gameIds }) => {
    const out: { gameId: Id<"games">; bggId: string }[] = [];
    for (const gameId of gameIds) {
      const g = await ctx.db.get("games", gameId);
      if (!g?.bggId) continue;
      out.push({ gameId, bggId: g.bggId });
    }
    return out;
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
    return g
      ? { _id: g._id, slug: g.slug, title: g.title, isStub: g.isStub === true }
      : null;
  },
});

/**
 * Delete a game and everything under it (rulebooks + chunks + drafts, chats +
 * messages, cover/thumbnail objects). Shared by the admin delete + the dev prune.
 */
export async function purgeGame(ctx: MutationCtx, game: Doc<"games">) {
  const gameId = game._id;
  // Rulebooks + their chunks + their storage.
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
    await deleteMedia(ctx, rb.storageKey, rb.storageId);
    await ctx.db.delete("rulebooks", rb._id);
  }

  // BGG refresh bookkeeping (bgg.ts).
  for (const r of await ctx.db
    .query("gameRefresh")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .take(10)) {
    await ctx.db.delete("gameRefresh", r._id);
  }

  // Detail content kept off the game doc.
  for (const gc of await ctx.db
    .query("gameContent")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .take(50)) {
    await ctx.db.delete("gameContent", gc._id);
  }

  // Chats + messages for this game (index-served so a bulk prune doesn't
  // re-scan the whole chats table per game).
  const chats = await ctx.db
    .query("chats")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .take(500);
  let delUser = 0;
  let delAi = 0;
  for (const chat of chats) {
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
      .take(1000);
    for (const m of msgs) {
      if (m.role === "user") delUser++;
      else delAi++;
      await ctx.db.delete("messages", m._id);
    }
    await ctx.db.delete("chats", chat._id);
  }
  await recordMessages(ctx, { user: -delUser, ai: -delAi });

  // Free cover + thumbnail objects (R2 keys or legacy blobs; dedupe). All
  // best-effort via deleteMedia, so a stale/already-removed object can't abort
  // the cascade mid-prune.
  const covers = new Set<string>();
  if (game.imageKey) covers.add(game.imageKey);
  if (game.thumbnailKey) covers.add(game.thumbnailKey);
  for (const key of covers) await deleteMedia(ctx, key, null);
  const blobs = new Set<Id<"_storage">>();
  if (game.imageId) blobs.add(game.imageId);
  if (game.thumbnailId) blobs.add(game.thumbnailId);
  for (const id of blobs) await deleteMedia(ctx, null, id);
  // A deleted chat-ready game leaves the chat-ready count.
  if (game.chatReady) await setChatReady(ctx, game, false);
  await ctx.db.delete("games", gameId);

  // If this was an expansion, recompute its parent's hasExpansions flag — but
  // only if the parent still exists (a bulk prune may have already deleted it).
  if (game.isExpansion && game.parentId) {
    const parent = await ctx.db.get("games", game.parentId);
    if (parent) {
      const sibling = await ctx.db
        .query("games")
        .withIndex("by_parent", (q) => q.eq("parentId", game.parentId))
        .first();
      await ctx.db.patch("games", game.parentId, {
        hasExpansions: sibling !== null,
      });
      // Its rulebooks may have been what made the parent chat-ready.
      await refreshChatReady(ctx, game.parentId);
    }
  }
}

/** Delete a game and everything under it (rulebooks, chunks, chats, messages). */
export const deleteGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    await requireAdmin(ctx);
    const game = await ctx.db.get("games", gameId);
    if (!game) return;
    // A real (non-expansion) game leaving the library — keep the total live.
    if (!game.isStub && !game.isExpansion) await adjustBaseGameCount(ctx, -1);
    await purgeGame(ctx, game);
  },
});

/**
 * One-off: seed `contentUpdatedAt` for pre-existing games (baseline
 * `_creationTime`) so the "Last updated" library sort has a sensible order
 * before any editorial edit touches them. Idempotent + self-paginating — run
 * `npx convex run games:backfillContentUpdatedAt` once per deployment.
 */
export const backfillContentUpdatedAt = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }): Promise<{ patched: number; done: boolean }> => {
    const page = await ctx.db
      .query("games")
      .paginate({ cursor: cursor ?? null, numItems: 200 });
    let patched = 0;
    for (const g of page.page) {
      if (g.contentUpdatedAt === undefined) {
        await ctx.db.patch("games", g._id, { contentUpdatedAt: g._creationTime });
        patched++;
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.games.backfillContentUpdatedAt,
        { cursor: page.continueCursor },
      );
    }
    return { patched, done: page.isDone };
  },
});
