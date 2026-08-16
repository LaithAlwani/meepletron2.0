import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, requireUser } from "./lib/auth";

/**
 * The user's manual collection toggles — the heart (wishlist) and the bookmark
 * (owned). These live on `bggCollection` rows in the `manualOwn`/`manualWishlist`
 * fields, kept separate from the BGG-imported `own`/`wishlist` so a re-sync
 * refreshes the BGG side without wiping what the user added by hand. A row that
 * ends up with no flag at all (BGG or manual) is deleted.
 */

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

/** Fields for a fresh manual row built from a game. */
function manualRowFields(
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
    manualOwn: false,
    manualWishlist: false,
  };
}

/** Apply a manual-flag change, deleting the row if nothing is left on it. */
async function setFlag(
  ctx: MutationCtx,
  gameId: Id<"games">,
  patch: { manualOwn?: boolean; manualWishlist?: boolean },
): Promise<boolean> {
  const user = await requireUser(ctx);
  const existing = await findRow(ctx, user._id, gameId);

  if (!existing) {
    const game = await ctx.db.get("games", gameId);
    if (!game) throw new ConvexError("Game not found");
    await ctx.db.insert("bggCollection", {
      ...manualRowFields(user._id, game),
      ...patch,
    });
    return patch.manualOwn ?? patch.manualWishlist ?? false;
  }

  const merged = { ...existing, ...patch };
  const anyFlag =
    merged.own ||
    merged.wishlist ||
    merged.manualOwn ||
    merged.manualWishlist;
  if (!anyFlag) {
    await ctx.db.delete("bggCollection", existing._id);
  } else {
    await ctx.db.patch("bggCollection", existing._id, patch);
  }
  return patch.manualOwn ?? patch.manualWishlist ?? false;
}

/** Heart → wishlist. Returns the new state. */
export const toggleWishlist = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<boolean> => {
    const user = await requireUser(ctx);
    const row = await findRow(ctx, user._id, gameId);
    return await setFlag(ctx, gameId, { manualWishlist: !row?.manualWishlist });
  },
});

/** Bookmark → owned. Returns the new state. */
export const toggleOwned = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<boolean> => {
    const user = await requireUser(ctx);
    const row = await findRow(ctx, user._id, gameId);
    return await setFlag(ctx, gameId, { manualOwn: !row?.manualOwn });
  },
});

/** The current user's manual toggle state for a game (drives the buttons). */
export const state = query({
  args: { gameId: v.id("games") },
  handler: async (
    ctx,
    { gameId },
  ): Promise<{ wishlist: boolean; owned: boolean }> => {
    const user = await getCurrentUser(ctx);
    if (!user) return { wishlist: false, owned: false };
    const row = await findRow(ctx, user._id, gameId);
    return {
      wishlist: !!row?.manualWishlist,
      owned: !!row?.manualOwn,
    };
  },
});
