import { v } from "convex/values";
import { query, mutation, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, requireUser } from "./lib/auth";

/**
 * Top Games — a user's ranked "Top N" list for a given year, with year-over-year
 * comparison (movement vs last year, New / Back tags, a 5-year position history,
 * and which games fell off), public sharing, and a community roll-up.
 *
 * A list is identified by (userId, size, year); at most one per triple. Entries
 * live as a bounded inline array (index = rank − 1) so a reorder is one cheap
 * patch and a finalized list is a self-contained snapshot.
 *
 * Conventions mirror convex/tuckboxes.ts: reads use getCurrentUser (degrade to
 * null/[]), writes use requireUser + an `existing.userId !== user._id` check,
 * `userId` always comes from the authed user, `updatedAt: Date.now()`.
 */

const MIN_SIZE = 3;
const MAX_SIZE = 250;
const HISTORY_YEARS = 5;
/** Public lists a single community roll-up will read — a hard, surfaced cap. */
const COMMUNITY_LIST_CAP = 200;
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

/** Public author info for a shared list / profile header. */
async function authorInfo(ctx: QueryCtx, userId: Id<"users">) {
  const u = await ctx.db.get("users", userId);
  if (!u) return null;
  const avatarUrl = u.avatarStorageId
    ? await ctx.storage.getUrl(u.avatarStorageId)
    : (u.image ?? null);
  return {
    username: u.username ?? null,
    name: u.name ?? null,
    avatarUrl,
  };
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
    return rows.map(listMeta);
  },
});

/** Create a draft list for (size, year). Surfaces an existing one instead of duping. */
export const create = mutation({
  args: {
    size: v.number(),
    year: v.number(),
    title: v.optional(v.string()),
    seedFromListId: v.optional(v.id("topGamesLists")),
  },
  handler: async (
    ctx,
    { size, year, title, seedFromListId },
  ): Promise<{ listId: Id<"topGamesLists">; existed: boolean }> => {
    const user = await requireUser(ctx);
    if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
      throw new Error(`Size must be a whole number between ${MIN_SIZE} and ${MAX_SIZE}.`);
    }
    if (!Number.isInteger(year) || year < 1970 || year > 2200) {
      throw new Error("That doesn't look like a valid year.");
    }

    const existing = await ctx.db
      .query("topGamesLists")
      .withIndex("by_user_size_year", (q) =>
        q.eq("userId", user._id).eq("size", size).eq("year", year),
      )
      .unique();
    if (existing) return { listId: existing._id, existed: true };

    let entries: ListDoc["entries"] = [];
    if (seedFromListId) {
      const seed = await ctx.db.get("topGamesLists", seedFromListId);
      if (seed && seed.userId === user._id) {
        entries = seed.entries.slice(0, size);
      }
    }

    const listId = await ctx.db.insert("topGamesLists", {
      userId: user._id,
      size,
      year,
      title: title?.trim() || undefined,
      status: "draft",
      visibility: "private",
      entries,
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

    const rows = await ctx.db
      .query("topGamesLists")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const lists = rows
      .filter((r) => r.visibility === "public" && r.status === "finalized")
      .sort((a, b) => b.year - a.year || b.size - a.size)
      .map(listMeta);

    return {
      author: await authorInfo(ctx, user._id),
      lists,
    };
  },
});

/**
 * Community Top N for a (size, year): a Borda-style roll-up of every public
 * list. Each list awards a game `size − rank + 1` points; games are ranked by
 * total points, then appearances, then average rank. Reads at most
 * COMMUNITY_LIST_CAP lists (surfaced to the UI). Public — works signed out.
 */
export const community = query({
  args: { size: v.number(), year: v.number() },
  handler: async (ctx, { size, year }) => {
    const lists = await ctx.db
      .query("topGamesLists")
      .withIndex("by_visibility_size_year", (q) =>
        q.eq("visibility", "public").eq("size", size).eq("year", year),
      )
      .take(COMMUNITY_LIST_CAP);

    const agg = new Map<
      Id<"games">,
      { title: string; points: number; appearances: number; rankSum: number }
    >();
    for (const list of lists) {
      // Only the ranked top `size` count toward the community — not honorable mentions.
      list.entries.slice(0, list.size).forEach((e, i) => {
        const rank = i + 1;
        const points = size - rank + 1;
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
      .slice(0, size);

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
      size,
      year,
      listsCounted: lists.length,
      capped: lists.length >= COMMUNITY_LIST_CAP,
      items,
    };
  },
});
