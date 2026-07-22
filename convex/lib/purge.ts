import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Delete a user's Convex Auth rows (accounts, verification codes, sessions,
 * refresh tokens) and finally the user row itself. Assumes the caller has
 * already handled the user's APP data (chats/messages/favorites) — either by
 * reassigning it (upgrade) or deleting it (cleanup). Bounded takes are fine:
 * a single user never has many auth rows.
 */
export async function deleteUserAndAuth(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .take(50);
  for (const a of accounts) {
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", a._id))
      .take(50);
    for (const c of codes) await ctx.db.delete("authVerificationCodes", c._id);
    await ctx.db.delete("authAccounts", a._id);
  }

  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .take(100);
  for (const s of sessions) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", s._id))
      .take(200);
    for (const t of tokens) await ctx.db.delete("authRefreshTokens", t._id);
    await ctx.db.delete("authSessions", s._id);
  }

  await ctx.db.delete("users", userId);
}

/** Delete a user's app data (favorites, chats, and each chat's messages). */
export async function deleteUserAppData(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const favorites = await ctx.db
    .query("favorites")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(1000);
  for (const f of favorites) await ctx.db.delete("favorites", f._id);

  const chats = await ctx.db
    .query("chats")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(1000);
  for (const chat of chats) {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
      .take(2000);
    for (const m of messages) await ctx.db.delete("messages", m._id);
    await ctx.db.delete("chats", chat._id);
  }
}
