import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, requireUser } from "./lib/auth";

/**
 * Collection status toggles. Every game the user has any relationship with is one
 * `bggCollection` row; the boolean status flags are the source of truth — the BGG
 * sync seeds them on import, the user edits them freely afterwards. The two
 * primary toggles are Owned (`own`, bookmark) and Want (`wishlist`, heart — which
 * folds BGG want/want-to-buy/preordered in at import); the sub-statuses are
 * wantToPlay / forTrade / prevOwned. A row with no flag left is deleted.
 */

/** All editable status flags on a collection row. */
const STATUS_KEYS = [
  "own",
  "wishlist",
  "wantToPlay",
  "forTrade",
  "prevOwned",
] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

/** A row is worth keeping while it still carries any status flag. */
function isMeaningful(row: Partial<Record<StatusKey, boolean | undefined>>): boolean {
  return STATUS_KEYS.some((k) => row[k]);
}

async function findRow(
  ctx: QueryCtx,
  userId: Id<"users">,
  gameId: Id<"games">,
): Promise<Doc<"bggCollection"> | null> {
  return await ctx.db
    .query("bggCollection")
    .withIndex("by_user_and_game", (q) =>
      q.eq("userId", userId).eq("gameId", gameId),
    )
    .unique();
}

/** Fields for a fresh collection row built from a game. */
function newRowFields(
  userId: Id<"users">,
  game: Doc<"games">,
): Omit<Doc<"bggCollection">, "_id" | "_creationTime"> {
  return {
    userId,
    gameId: game._id,
    // Real BGG id when we have one (so a later sync lands on this same row);
    // otherwise a synthetic per-game key that can't collide with a BGG id.
    bggId: game.bggId ?? `local:${game._id}`,
    title: game.title,
    sortTitle: game.title.toLowerCase(),
    year: game.year,
    isExpansion: game.isExpansion,
    own: false,
    syncedAt: Date.now(),
  };
}

/** Apply a status change, creating the row or deleting it once no flag is left. */
async function setFlags(
  ctx: MutationCtx,
  gameId: Id<"games">,
  patch: Partial<Record<StatusKey, boolean>>,
): Promise<void> {
  const user = await requireUser(ctx);
  const existing = await findRow(ctx, user._id, gameId);

  if (!existing) {
    const game = await ctx.db.get("games", gameId);
    if (!game) throw new ConvexError("Game not found");
    await ctx.db.insert("bggCollection", {
      ...newRowFields(user._id, game),
      ...patch,
    });
    return;
  }

  const merged = { ...existing, ...patch };
  if (!isMeaningful(merged)) {
    await ctx.db.delete("bggCollection", existing._id);
  } else {
    await ctx.db.patch("bggCollection", existing._id, patch);
  }
}

/** Heart → Want (the merged wishlist bucket). Returns the new state. */
export const toggleWishlist = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<boolean> => {
    const user = await requireUser(ctx);
    const row = await findRow(ctx, user._id, gameId);
    const next = !row?.wishlist;
    await setFlags(ctx, gameId, { wishlist: next });
    return next;
  },
});

/** Bookmark → Owned. Returns the new state. */
export const toggleOwned = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<boolean> => {
    const user = await requireUser(ctx);
    const row = await findRow(ctx, user._id, gameId);
    const next = !row?.own;
    await setFlags(ctx, gameId, { own: next });
    return next;
  },
});

/** Set one of the editable sub-statuses (want to play / for trade / prev owned). */
export const setStatus = mutation({
  args: {
    gameId: v.id("games"),
    key: v.union(
      v.literal("wantToPlay"),
      v.literal("forTrade"),
      v.literal("prevOwned"),
    ),
    value: v.boolean(),
  },
  handler: async (ctx, { gameId, key, value }) => {
    await setFlags(ctx, gameId, { [key]: value });
  },
});

/** The current user's full status for a game (drives the toggles + status menu). */
export const state = query({
  args: { gameId: v.id("games") },
  handler: async (
    ctx,
    { gameId },
  ): Promise<{
    owned: boolean;
    want: boolean;
    wantToPlay: boolean;
    forTrade: boolean;
    prevOwned: boolean;
  }> => {
    const zero = {
      owned: false,
      want: false,
      wantToPlay: false,
      forTrade: false,
      prevOwned: false,
    };
    const user = await getCurrentUser(ctx);
    if (!user) return zero;
    const row = await findRow(ctx, user._id, gameId);
    if (!row) return zero;
    return {
      owned: !!row.own,
      want: !!row.wishlist,
      wantToPlay: !!row.wantToPlay,
      forTrade: !!row.forTrade,
      prevOwned: !!row.prevOwned,
    };
  },
});
