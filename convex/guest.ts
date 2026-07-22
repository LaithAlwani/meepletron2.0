import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { deleteUserAndAuth } from "./lib/purge";

const UPGRADE_TTL_MS = 15 * 60 * 1000;

/**
 * Guest → account upgrade, step 1. Called while the user is still signed in as
 * an anonymous guest: stash a short-lived, client-generated claim token on the
 * guest's user row. After the user signs up (a NEW account, since Convex Auth
 * doesn't auto-link), `completeUpgrade` redeems this token to move the guest's
 * data over. The token is the secret — only the guest's own session can set it.
 */
export const beginUpgrade = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    if (token.length < 16) throw new Error("Invalid token");
    const user = await ctx.db.get("users", userId);
    if (!user?.isAnonymous) throw new Error("Only guests can upgrade");
    await ctx.db.patch("users", userId, {
      upgradeToken: token,
      upgradeTokenExpiresAt: Date.now() + UPGRADE_TTL_MS,
    });
  },
});

/**
 * Guest → account upgrade, step 2. Called right after signing up/in, when the
 * session now belongs to a real (non-anonymous) account. Migrates the guest's
 * chats + favorites to the real account (de-duping against anything the real
 * account already has), then deletes the spent guest user and its auth rows.
 */
export const completeUpgrade = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) return { migrated: false as const };
    const current = await ctx.db.get("users", currentUserId);
    // Must be a real account — i.e. the sign-up actually happened.
    if (!current || current.isAnonymous) return { migrated: false as const };

    const guest = await ctx.db
      .query("users")
      .withIndex("by_upgrade_token", (q) => q.eq("upgradeToken", token))
      .unique();
    if (
      !guest ||
      guest._id === currentUserId ||
      !guest.isAnonymous ||
      (guest.upgradeTokenExpiresAt ?? 0) < Date.now()
    ) {
      return { migrated: false as const };
    }

    // Chats: move each, unless the real account already has a chat for that
    // game — then drop the guest's copy (+ its messages) to avoid duplicates.
    let chatsMoved = 0;
    const guestChats = await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", guest._id))
      .take(1000);
    for (const chat of guestChats) {
      const existing = await ctx.db
        .query("chats")
        .withIndex("by_user_and_game", (q) =>
          q.eq("userId", currentUserId).eq("gameId", chat.gameId),
        )
        .first();
      if (existing) {
        const msgs = await ctx.db
          .query("messages")
          .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
          .take(2000);
        for (const m of msgs) await ctx.db.delete("messages", m._id);
        await ctx.db.delete("chats", chat._id);
      } else {
        await ctx.db.patch("chats", chat._id, { userId: currentUserId });
        chatsMoved++;
      }
    }

    // Favorites: move each, unless already favorited by the real account.
    let favoritesMoved = 0;
    const guestFavorites = await ctx.db
      .query("favorites")
      .withIndex("by_user", (q) => q.eq("userId", guest._id))
      .take(1000);
    for (const fav of guestFavorites) {
      const dupe = await ctx.db
        .query("favorites")
        .withIndex("by_user_and_game", (q) =>
          q.eq("userId", currentUserId).eq("gameId", fav.gameId),
        )
        .first();
      if (dupe) {
        await ctx.db.delete("favorites", fav._id);
      } else {
        await ctx.db.patch("favorites", fav._id, { userId: currentUserId });
        favoritesMoved++;
      }
    }

    // Guest row has no data left — delete it and its auth rows.
    await deleteUserAndAuth(ctx, guest._id);

    return {
      migrated: true as const,
      chats: chatsMoved,
      favorites: favoritesMoved,
    };
  },
});
