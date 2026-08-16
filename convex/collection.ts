import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, requireUser } from "./lib/auth";

/**
 * The heart (wishlist) and bookmark (owned) toggles. `own`/`wishlist` on the
 * `bggCollection` row are the single source of truth — the BGG sync seeds them
 * on first import, and the user edits them freely afterwards. A row that ends up
 * with neither flag is deleted; a row with either shows in the matching tab.
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

/** Set own/wishlist, creating the row or deleting it once both are off. */
async function setFlags(
  ctx: MutationCtx,
  gameId: Id<"games">,
  patch: { own?: boolean; wishlist?: boolean },
): Promise<boolean> {
  const user = await requireUser(ctx);
  const existing = await findRow(ctx, user._id, gameId);

  if (!existing) {
    const game = await ctx.db.get("games", gameId);
    if (!game) throw new ConvexError("Game not found");
    await ctx.db.insert("bggCollection", {
      ...newRowFields(user._id, game),
      ...patch,
    });
    return patch.own ?? patch.wishlist ?? false;
  }

  const merged = { ...existing, ...patch };
  if (!merged.own && !merged.wishlist) {
    await ctx.db.delete("bggCollection", existing._id);
  } else {
    await ctx.db.patch("bggCollection", existing._id, patch);
  }
  return patch.own ?? patch.wishlist ?? false;
}

/** Heart → wishlist. Returns the new state. */
export const toggleWishlist = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<boolean> => {
    const user = await requireUser(ctx);
    const row = await findRow(ctx, user._id, gameId);
    return await setFlags(ctx, gameId, { wishlist: !row?.wishlist });
  },
});

/** Bookmark → owned. Returns the new state. */
export const toggleOwned = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<boolean> => {
    const user = await requireUser(ctx);
    const row = await findRow(ctx, user._id, gameId);
    return await setFlags(ctx, gameId, { own: !row?.own });
  },
});

/** The current user's collection state for a game (drives the buttons). */
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
      wishlist: !!row?.wishlist,
      owned: !!row?.own,
    };
  },
});
