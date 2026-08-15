import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

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

/**
 * Delete a user's app data (favorites, chats and their messages, and anything
 * synced from BoardGameGeek).
 */
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

  // BGG link + job rows are at most a handful, so they go inline. Note the
  // account row holds the sealed session cookie — it must not outlive the user.
  const bggAccount = await ctx.db
    .query("bggAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (bggAccount) await ctx.db.delete("bggAccounts", bggAccount._id);

  const bggJobs = await ctx.db
    .query("bggSyncJobs")
    .withIndex("by_user_and_kind", (q) => q.eq("userId", userId))
    .take(10);
  for (const j of bggJobs) await ctx.db.delete("bggSyncJobs", j._id);

  // The synced collection and plays can run to thousands of rows — far past a
  // single transaction — so they cascade out of band. This is scheduled rather
  // than awaited on purpose: `deleteUserAndAuth` removes the user row moments
  // later, so the cascade keys off the raw id and never reads the user.
  await ctx.scheduler.runAfter(0, internal.bggSync.purgeUserBggData, { userId });
}
