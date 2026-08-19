import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  internalMutation,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, requireUser } from "./lib/auth";
import { DEFAULT_CATEGORY, isTopCategory } from "./lib/topGamesCategories";
import { isGameSort } from "./lib/gameSort";

/**
 * Top Games — a user's ranked "Top N" list for a given year, with year-over-year
 * comparison (movement vs last year, New / Back tags, a 5-year position history,
 * and which games fell off), public sharing, and a community roll-up.
 *
 * A list is identified by (userId, category, size, year); at most one per tuple.
 * Entries
 * live as a bounded inline array (index = rank − 1) so a reorder is one cheap
 * patch and a finalized list is a self-contained snapshot.
 *
 * Conventions mirror convex/tuckboxes.ts: reads use getCurrentUser (degrade to
 * null/[]), writes use requireUser + an `existing.userId !== user._id` check,
 * `userId` always comes from the authed user, `updatedAt: Date.now()`.
 */

/** The only list sizes we offer. */
const PRESET_SIZES = [10, 25, 50, 100];
const HISTORY_YEARS = 5;
/** Public lists a single community roll-up will read — a hard, surfaced cap. */
const COMMUNITY_LIST_CAP = 200;
/** Each list contributes its top N to the roll-up, so all sizes count equally. */
const COMMUNITY_WINDOW = 25;
/** How many aggregated games the community roll-up returns. */
const COMMUNITY_TOP = 25;
/** Honorable mentions kept when a list is finalized (the overflow past `size`). */
const HM_KEPT = 5;
/** Honorable-mention candidates allowed while a list is still a draft. */
const HM_DRAFT_MAX = 50;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

type ListDoc = Doc<"topGamesLists">;

/** Compact game shape for list rows — cover + slug + title, nothing heavy. */
async function gameThumb(ctx: QueryCtx, gameId: Id<"games">) {
  const g = await ctx.db.get("games", gameId);
  if (!g) return null;
  const thumbUrl = g.thumbnailId
    ? await ctx.storage.getUrl(g.thumbnailId)
    : g.imageId
      ? await ctx.storage.getUrl(g.imageId)
      : null;
  return {
    _id: g._id,
    slug: g.slug,
    title: g.title,
    year: g.year ?? null,
    thumbUrl,
  };
}

/**
 * Public author info for a shared list / profile header, honouring the user's
 * sharing choices: name and avatar are withheld unless opted in (default on).
 */
async function authorInfo(ctx: QueryCtx, userId: Id<"users">) {
  const u = await ctx.db.get("users", userId);
  if (!u) return null;
  const p = u.publicProfile ?? {};
  const showName = p.showName ?? true;
  const showAvatar = p.showAvatar ?? true;
  const avatarUrl = showAvatar
    ? u.avatarStorageId
      ? await ctx.storage.getUrl(u.avatarStorageId)
      : (u.image ?? null)
    : null;
  return {
    username: u.username ?? null,
    name: showName ? (u.name ?? null) : null,
    avatarUrl,
  };
}

/**
 * A shared "list of games" section for the public profile (owned / for-trade /
 * wishlist), drawn from the user's BGG collection. Returns the total count and a
 * bounded, cover-resolved sample.
 */
async function collectionSection(
  ctx: QueryCtx,
  userId: Id<"users">,
  pick: (r: Doc<"bggCollection">) => boolean,
  limit: number,
) {
  // A bounded scan: a public profile is a showcase, not the full collection —
  // resolving thousands of covers in one query would blow read/byte limits.
  const rows = await ctx.db
    .query("bggCollection")
    .withIndex("by_user_and_sort_title", (q) => q.eq("userId", userId))
    .take(600);
  const matched = rows.filter(pick);
  const items = await Promise.all(
    matched.slice(0, limit).map(async (r) => {
      const g = r.gameId ? await ctx.db.get("games", r.gameId) : null;
      const thumbUrl = g?.thumbnailId
        ? await ctx.storage.getUrl(g.thumbnailId)
        : g?.imageId
          ? await ctx.storage.getUrl(g.imageId)
          : null;
      return {
        gameId: r.gameId ?? null,
        title: g?.title ?? r.title,
        slug: g?.slug ?? null,
        thumbUrl,
      };
    }),
  );
  return { total: matched.length, items };
}

/** Rank (1-based) of a game within a list's entries, or null if absent. */
function rankOf(list: ListDoc, gameId: Id<"games">): number | null {
  const i = list.entries.findIndex((e) => e.gameId === gameId);
  return i === -1 ? null : i + 1;
}

/**
 * Prior finalized lists of the same size, most-recent year first, up to the
 * 5 years before this list. When `publicOnly`, only the owner's public lists are
 * considered — so a shared list never leaks ranks from a private year.
 */
async function priorLists(
  ctx: QueryCtx,
  list: ListDoc,
  publicOnly: boolean,
): Promise<ListDoc[]> {
  const rows = await ctx.db
    .query("topGamesLists")
    .withIndex("by_user_and_size", (q) =>
      q.eq("userId", list.userId).eq("size", list.size),
    )
    .take(50);
  return rows
    .filter(
      (r) =>
        r._id !== list._id &&
        (r.category ?? DEFAULT_CATEGORY) === (list.category ?? DEFAULT_CATEGORY) &&
        r.status === "finalized" &&
        r.year < list.year &&
        (!publicOnly || r.visibility === "public"),
    )
    .sort((a, b) => b.year - a.year)
    .slice(0, HISTORY_YEARS);
}

export type TopTag = "same" | "moved" | "new" | "back" | null;

/**
 * Hydrate a list + compute the comparison against the owner's prior lists.
 * `ownerView` controls whether private prior years are visible (owner) or only
 * public ones (a shared/community viewer).
 */
async function computeList(
  ctx: QueryCtx,
  list: ListDoc,
  ownerView: boolean,
) {
  const priors = await priorLists(ctx, list, !ownerView);
  const prevYear = list.year - 1;
  const prevList = priors.find((p) => p.year === prevYear) ?? null;

  const items = await Promise.all(
    list.entries.map(async (entry, i) => {
      const rank = i + 1;
      const g = entry.gameId;
      const prevRank = prevList ? rankOf(prevList, g) : null;
      const movement = prevRank != null ? prevRank - rank : null; // + = up

      // Positions across the last 5 prior years (most recent first).
      const history = priors
        .map((p) => ({ year: p.year, rank: rankOf(p, g) }))
        .filter((h): h is { year: number; rank: number } => h.rank != null);

      let tag: TopTag = null;
      if (priors.length > 0 || prevList) {
        if (prevRank != null) {
          tag = movement === 0 ? "same" : "moved";
        } else if (history.length > 0) {
          tag = "back"; // on a past list, but not last year
        } else {
          tag = "new";
        }
      }

      return {
        rank,
        gameId: g,
        title: entry.title,
        game: await gameThumb(ctx, g),
        movement,
        tag,
        history,
      };
    }),
  );

  // Games that were in last year's ranked list (not its honorable mentions) but
  // aren't anywhere on this list anymore. A demotion to honorable mention counts
  // as still present, not a drop.
  const present = new Set(list.entries.map((e) => e.gameId));
  const droppedOff = prevList
    ? await Promise.all(
        prevList.entries
          .slice(0, prevList.size)
          .map((e, i) => ({ ...e, rank: i + 1 }))
          .filter((e) => !present.has(e.gameId))
          .slice(0, 50)
          .map(async (e) => ({
            gameId: e.gameId,
            title: e.title,
            lastRank: e.rank,
            game: await gameThumb(ctx, e.gameId),
          })),
      )
    : [];

  return {
    items,
    droppedOff,
    hasPrior: priors.length > 0 || prevList != null,
    prevYear: prevList ? prevList.year : null,
  };
}

/** The lightweight, always-safe projection of a list (no entries payload). */
function listMeta(list: ListDoc) {
  return {
    _id: list._id,
    category: list.category ?? DEFAULT_CATEGORY,
    size: list.size,
    year: list.year,
    title: list.title ?? null,
    status: list.status,
    visibility: list.visibility,
    count: list.entries.length,
    finalizedAt: list.finalizedAt ?? null,
    updatedAt: list.updatedAt,
  };
}

/**
 * Up to `n` cover URLs sampled from a list's games, for the collage on a list
 * card. Deterministic per list (a PRNG seeded from its id), so the picks look
 * random but stay stable across query re-runs — Math.random isn't allowed in
 * queries, and a reshuffle on every render would be jarring anyway. Reads are
 * bounded to a few candidates.
 */
async function coverSample(
  ctx: QueryCtx,
  list: ListDoc,
  n: number,
): Promise<string[]> {
  if (list.entries.length === 0) return [];
  let h = 0;
  for (let i = 0; i < list._id.length; i++) {
    h = (Math.imul(h, 31) + list._id.charCodeAt(i)) | 0;
  }
  const rand = () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const idx = list.entries.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const covers: string[] = [];
  for (const i of idx.slice(0, n + 4)) {
    if (covers.length >= n) break;
    const g = await ctx.db.get("games", list.entries[i].gameId);
    if (!g) continue;
    const url = g.thumbnailId
      ? await ctx.storage.getUrl(g.thumbnailId)
      : g.imageId
        ? await ctx.storage.getUrl(g.imageId)
        : null;
    if (url) covers.push(url);
  }
  return covers;
}

/** A list card row: the lightweight meta plus a small cover collage. */
async function listCard(ctx: QueryCtx, list: ListDoc) {
  return { ...listMeta(list), covers: await coverSample(ctx, list, 5) };
}

/** Load an owned list for a write, or throw. */
async function ownedList(
  ctx: QueryCtx,
  id: Id<"topGamesLists">,
  userId: Id<"users">,
): Promise<ListDoc> {
  const list = await ctx.db.get("topGamesLists", id);
  if (!list || list.userId !== userId) throw new Error("List not found");
  return list;
}

/* -------------------------------------------------------------------------- */
/* Owner CRUD                                                                 */
/* -------------------------------------------------------------------------- */

/** The caller's lists (newest year first), lightweight rows for the gallery. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query("topGamesLists")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    rows.sort((a, b) => b.year - a.year || b.size - a.size);
    return await Promise.all(rows.map((r) => listCard(ctx, r)));
  },
});

/**
 * Create a draft list for (category, size, year). Surfaces an existing one for
 * that triple instead of duping.
 */
export const create = mutation({
  args: {
    category: v.optional(v.string()),
    size: v.number(),
    year: v.number(),
    title: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { category, size, year, title },
  ): Promise<{ listId: Id<"topGamesLists">; existed: boolean }> => {
    const user = await requireUser(ctx);
    const cat = category ?? DEFAULT_CATEGORY;
    if (!isTopCategory(cat)) {
      throw new Error("Pick a valid category.");
    }
    if (!PRESET_SIZES.includes(size)) {
      throw new Error("Pick a list size of 10, 25, 50, or 100.");
    }
    if (!Number.isInteger(year) || year < 1970 || year > 2200) {
      throw new Error("That doesn't look like a valid year.");
    }

    const existing = await ctx.db
      .query("topGamesLists")
      .withIndex("by_user_category_size_year", (q) =>
        q
          .eq("userId", user._id)
          .eq("category", cat)
          .eq("size", size)
          .eq("year", year),
      )
      .unique();
    if (existing) return { listId: existing._id, existed: true };

    const listId = await ctx.db.insert("topGamesLists", {
      userId: user._id,
      category: cat,
      size,
      year,
      title: title?.trim() || undefined,
      status: "draft",
      visibility: "private",
      entries: [],
      updatedAt: Date.now(),
    });
    return { listId, existed: false };
  },
});

/**
 * Replace the ordered membership — the single autosave path for add / remove /
 * reorder. Titles for games already present are reused; only newly-added games
 * are fetched, so a pure reorder reads nothing. Draft only.
 */
export const setEntries = mutation({
  args: { id: v.id("topGamesLists"), gameIds: v.array(v.id("games")) },
  handler: async (ctx, { id, gameIds }) => {
    const user = await requireUser(ctx);
    const list = await ownedList(ctx, id, user._id);
    if (list.status !== "draft") throw new Error("Finalized lists are read-only.");

    const prevTitles = new Map(list.entries.map((e) => [e.gameId, e.title]));
    const seen = new Set<Id<"games">>();
    const entries: ListDoc["entries"] = [];
    // Allow overflow past `size` — those become honorable-mention candidates.
    for (const gid of gameIds.slice(0, list.size + HM_DRAFT_MAX)) {
      if (seen.has(gid)) continue;
      seen.add(gid);
      let title = prevTitles.get(gid);
      if (title === undefined) {
        const g = await ctx.db.get("games", gid);
        if (!g) continue; // skip a game that no longer exists
        title = g.title;
      }
      entries.push({ gameId: gid, title });
    }
    await ctx.db.patch("topGamesLists", id, { entries, updatedAt: Date.now() });
  },
});

/** Rename a list (empty clears back to the default title). */
export const rename = mutation({
  args: { id: v.id("topGamesLists"), title: v.string() },
  handler: async (ctx, { id, title }) => {
    const user = await requireUser(ctx);
    await ownedList(ctx, id, user._id);
    await ctx.db.patch("topGamesLists", id, {
      title: title.trim() || undefined,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Finalize: stamp the list as this year's ranking. Keeps the top `size` plus the
 * best `HM_KEPT` honorable mentions; any further overflow is dropped. Requires ≥1
 * game.
 */
export const finalize = mutation({
  args: { id: v.id("topGamesLists") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const list = await ownedList(ctx, id, user._id);
    if (list.entries.length === 0) throw new Error("Add at least one game first.");
    await ctx.db.patch("topGamesLists", id, {
      status: "finalized",
      finalizedAt: Date.now(),
      updatedAt: Date.now(),
      entries: list.entries.slice(0, list.size + HM_KEPT),
    });
  },
});

/** Reopen a finalized list for editing — forces it back to private. */
export const reopen = mutation({
  args: { id: v.id("topGamesLists") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    await ownedList(ctx, id, user._id);
    await ctx.db.patch("topGamesLists", id, {
      status: "draft",
      visibility: "private",
      updatedAt: Date.now(),
    });
  },
});

/** Toggle a list public/private. Public requires a finalized list. */
export const setVisibility = mutation({
  args: {
    id: v.id("topGamesLists"),
    visibility: v.union(v.literal("private"), v.literal("public")),
  },
  handler: async (ctx, { id, visibility }) => {
    const user = await requireUser(ctx);
    const list = await ownedList(ctx, id, user._id);
    if (visibility === "public" && list.status !== "finalized") {
      throw new Error("Finalize the list before making it public.");
    }
    await ctx.db.patch("topGamesLists", id, { visibility, updatedAt: Date.now() });
  },
});

/**
 * One-off backfill: stamp the default category on any list created before the
 * category field existed. Safe to re-run (only patches missing values).
 */
export const backfillCategory = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("topGamesLists").collect();
    let patched = 0;
    for (const r of rows) {
      if (r.category === undefined) {
        await ctx.db.patch("topGamesLists", r._id, { category: DEFAULT_CATEGORY });
        patched++;
      }
    }
    return { patched };
  },
});

/** Delete a list (owner only; silent no-op otherwise). */
export const remove = mutation({
  args: { id: v.id("topGamesLists") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const list = await ctx.db.get("topGamesLists", id);
    if (!list || list.userId !== user._id) return;
    await ctx.db.delete("topGamesLists", id);
  },
});

/* -------------------------------------------------------------------------- */
/* Reads: single list (owner or public), profile, community                   */
/* -------------------------------------------------------------------------- */

/**
 * A single list by id, for the `/top-games/[listId]` route. Works for the owner
 * (any status/visibility) and for anyone on a public list. Returns null when a
 * non-owner asks for a private/missing list. Non-owner comparison uses only the
 * owner's public prior years.
 */
export const getList = query({
  args: { id: v.id("topGamesLists") },
  handler: async (ctx, { id }) => {
    const viewer = await getCurrentUser(ctx);
    const list = await ctx.db.get("topGamesLists", id);
    if (!list) return null;
    const isOwner = viewer != null && viewer._id === list.userId;
    if (!isOwner && list.visibility !== "public") return null;

    const computed = await computeList(ctx, list, isOwner);
    return {
      ...listMeta(list),
      isOwner,
      canEdit: isOwner,
      author: isOwner ? null : await authorInfo(ctx, list.userId),
      ...computed,
    };
  },
});

/** A user's public profile: their public finalized lists. Null if no such user. */
export const publicProfile = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const lower = username.trim().toLowerCase();
    if (!lower) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_username_lower", (q) => q.eq("usernameLower", lower))
      .unique();
    if (!user) return null;

    const p = user.publicProfile ?? {};
    const showTopLists = p.showTopLists ?? true;

    let lists: Awaited<ReturnType<typeof listCard>>[] = [];
    if (showTopLists) {
      const rows = await ctx.db
        .query("topGamesLists")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      const filtered = rows
        .filter((r) => r.visibility === "public" && r.status === "finalized")
        .sort((a, b) => b.year - a.year || b.size - a.size);
      lists = await Promise.all(filtered.map((r) => listCard(ctx, r)));
    }

    return {
      author: await authorInfo(ctx, user._id),
      lists,
      // Whether to show a plays section — the plays themselves are fetched by the
      // page via api.plays.userPublicPlays (keeps the play projection in one place).
      showPlays: p.showPlays ?? false,
      owned:
        (p.showOwned ?? false)
          ? await collectionSection(ctx, user._id, (r) => r.own === true, 30)
          : null,
      forTrade:
        (p.showForTrade ?? false)
          ? await collectionSection(ctx, user._id, (r) => r.forTrade === true, 30)
          : null,
      wishlist:
        (p.showWishlist ?? false)
          ? await collectionSection(ctx, user._id, (r) => r.wishlist === true, 30)
          : null,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Full collection browse (paginated)                                         */
/* -------------------------------------------------------------------------- */

const collectionListValidator = v.union(
  v.literal("owned"),
  v.literal("for-trade"),
  v.literal("wishlist"),
);
type CollectionList = "owned" | "for-trade" | "wishlist";

/** The bggCollection flag field + this user's share toggle for a list. */
function collectionField(list: CollectionList): "own" | "forTrade" | "wishlist" {
  return list === "owned" ? "own" : list === "for-trade" ? "forTrade" : "wishlist";
}
function isShared(
  prefs: NonNullable<Doc<"users">["publicProfile"]>,
  list: CollectionList,
): boolean {
  return list === "owned"
    ? (prefs.showOwned ?? false)
    : list === "for-trade"
      ? (prefs.showForTrade ?? false)
      : (prefs.showWishlist ?? false);
}

async function userByUsername(ctx: QueryCtx, username: string) {
  const lower = username.trim().toLowerCase();
  if (!lower) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_username_lower", (q) => q.eq("usernameLower", lower))
    .unique();
}

/** Header info + whether a given collection list is shared, for the browse page. */
export const publicCollectionMeta = query({
  args: { username: v.string(), list: collectionListValidator },
  handler: async (ctx, { username, list }) => {
    const user = await userByUsername(ctx, username);
    if (!user) return null;
    return {
      author: await authorInfo(ctx, user._id),
      shared: isShared(user.publicProfile ?? {}, list),
    };
  },
});

/**
 * Paginated full collection list for a public profile (owned / for-trade /
 * wishlist). Returns an empty, done page when the user doesn't exist or hasn't
 * shared that list. Handles hundreds/thousands of games without loading them
 * all at once.
 */
export const publicCollectionPage = query({
  args: {
    username: v.string(),
    list: collectionListValidator,
    paginationOpts: paginationOptsValidator,
    sort: v.optional(v.string()),
  },
  handler: async (ctx, { username, list, paginationOpts, sort }) => {
    const empty = { page: [], isDone: true, continueCursor: "" };
    const user = await userByUsername(ctx, username);
    if (!user || !isShared(user.publicProfile ?? {}, list)) return empty;

    const field = collectionField(list);
    const thumbItem = async (
      r: Doc<"bggCollection">,
      g: Doc<"games"> | null,
    ) => {
      const thumbUrl = g?.thumbnailId
        ? await ctx.storage.getUrl(g.thumbnailId)
        : g?.imageId
          ? await ctx.storage.getUrl(g.imageId)
          : (r.thumbnailUrl ?? null);
      return {
        _id: r._id,
        gameId: r.gameId ?? null,
        title: g?.title ?? r.title,
        slug: g?.slug ?? null,
        thumbUrl,
      };
    };

    // Sorted path (game-field sorts): bounded load + join + sort + offset page.
    const sortKey = sort && isGameSort(sort) && sort !== "title" ? sort : null;
    if (sortKey) {
      const rows = await ctx.db
        .query("bggCollection")
        .withIndex("by_user_and_sort_title", (q) => q.eq("userId", user._id))
        .filter((q) => q.eq(q.field(field), true))
        .take(2000); // the collection's practical cap
      const paired = await Promise.all(
        rows.map(async (r) => ({
          r,
          g: r.gameId ? await ctx.db.get("games", r.gameId) : null,
        })),
      );
      const num = (v?: number) => v ?? -Infinity;
      paired.sort((a, b) => {
        switch (sortKey) {
          case "year":
            return num(b.g?.yearNum) - num(a.g?.yearNum);
          case "weight":
            return num(b.g?.bggWeight) - num(a.g?.bggWeight);
          case "rated":
            return num(b.g?.bggRatingCount) - num(a.g?.bggRatingCount);
          case "newest":
            return (
              (b.g?._creationTime ?? b.r._creationTime) -
              (a.g?._creationTime ?? a.r._creationTime)
            );
          case "rating":
          default:
            return num(b.g?.bggRating) - num(a.g?.bggRating);
        }
      });
      const offset = Number(paginationOpts.cursor ?? "0") || 0;
      const end = offset + paginationOpts.numItems;
      const slice = paired.slice(offset, end);
      return {
        page: await Promise.all(slice.map(({ r, g }) => thumbItem(r, g))),
        isDone: end >= paired.length,
        continueCursor: String(end),
      };
    }

    const result = await ctx.db
      .query("bggCollection")
      .withIndex("by_user_and_sort_title", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field(field), true))
      .paginate(paginationOpts);

    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (r) => {
          const g = r.gameId ? await ctx.db.get("games", r.gameId) : null;
          return await thumbItem(r, g);
        }),
      ),
    };
  },
});

/**
 * Community Top games for a (category, year): a Borda-style roll-up of every
 * public list in that category, regardless of each list's own size. Each list
 * contributes its top `COMMUNITY_WINDOW` games, awarding `WINDOW − rank + 1`
 * points, so a Top 10 and a Top 100 count on the same scale. Games are ranked by
 * total points, then appearances, then average rank. Reads at most
 * COMMUNITY_LIST_CAP lists (surfaced to the UI). Public — works signed out.
 */
export const community = query({
  args: {
    category: v.optional(v.string()),
    year: v.number(),
    // Optional: restrict the roll-up to lists of a specific size (10/25/50/100).
    size: v.optional(v.number()),
  },
  handler: async (ctx, { category, year, size }) => {
    const cat = category ?? DEFAULT_CATEGORY;
    const all = await ctx.db
      .query("topGamesLists")
      .withIndex("by_visibility_category_year", (q) =>
        q.eq("visibility", "public").eq("category", cat).eq("year", year),
      )
      .take(COMMUNITY_LIST_CAP);
    const lists = size ? all.filter((l) => l.size === size) : all;

    const agg = new Map<
      Id<"games">,
      { title: string; points: number; appearances: number; rankSum: number }
    >();
    for (const list of lists) {
      // Each list's ranked top games (up to the shared window) count — not its
      // honorable mentions, and never more than COMMUNITY_WINDOW entries.
      const cutoff = Math.min(list.size, COMMUNITY_WINDOW);
      list.entries.slice(0, cutoff).forEach((e, i) => {
        const rank = i + 1;
        const points = COMMUNITY_WINDOW - rank + 1;
        const cur = agg.get(e.gameId);
        if (cur) {
          cur.points += points;
          cur.appearances += 1;
          cur.rankSum += rank;
          if (!cur.title) cur.title = e.title;
        } else {
          agg.set(e.gameId, {
            title: e.title,
            points,
            appearances: 1,
            rankSum: rank,
          });
        }
      });
    }

    const ranked = [...agg.entries()]
      .map(([gameId, a]) => ({
        gameId,
        title: a.title,
        points: a.points,
        appearances: a.appearances,
        avgRank: a.rankSum / a.appearances,
      }))
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.appearances - a.appearances ||
          a.avgRank - b.avgRank,
      )
      .slice(0, COMMUNITY_TOP);

    const items = await Promise.all(
      ranked.map(async (r, i) => ({
        rank: i + 1,
        gameId: r.gameId,
        title: r.title,
        appearances: r.appearances,
        avgRank: Math.round(r.avgRank * 10) / 10,
        game: await gameThumb(ctx, r.gameId),
      })),
    );

    return {
      category: cat,
      year,
      size: size ?? null,
      listsCounted: lists.length,
      // The cap applies to the pre-size-filter fetch; surface it when we hit it.
      capped: all.length >= COMMUNITY_LIST_CAP,
      items,
    };
  },
});
