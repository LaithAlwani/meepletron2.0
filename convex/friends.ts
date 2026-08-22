import { v, ConvexError } from "convex/values";
import {
  query,
  mutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, requireUser } from "./lib/auth";

/**
 * Friendships between accounts. A friend can see a private profile; a stranger
 * can only send a request. One row per pair (canonical `userA` id < `userB` id).
 */

/** Canonical pair ordering so a pair maps to exactly one row. */
function pair(a: Id<"users">, b: Id<"users">) {
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a };
}

async function getFriendship(ctx: QueryCtx, a: Id<"users">, b: Id<"users">) {
  const { userA, userB } = pair(a, b);
  return await ctx.db
    .query("friendships")
    .withIndex("by_pair", (q) => q.eq("userA", userA).eq("userB", userB))
    .unique();
}

async function userByUsername(ctx: QueryCtx, username: string) {
  const lower = username.trim().toLowerCase();
  if (!lower) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_username_lower", (q) => q.eq("usernameLower", lower))
    .unique();
}

/** Whether two accounts are accepted friends. */
export async function areFriends(
  ctx: QueryCtx,
  a: Id<"users">,
  b: Id<"users">,
): Promise<boolean> {
  return (await getFriendship(ctx, a, b))?.status === "accepted";
}

/** Whether `viewerId` may see `target`'s profile: public, self, or a friend. */
export async function canViewProfile(
  ctx: QueryCtx,
  target: Doc<"users">,
  viewerId: Id<"users"> | null,
): Promise<boolean> {
  if (target.publicProfile?.isPublic ?? true) return true;
  if (!viewerId) return false;
  if (viewerId === target._id) return true;
  return await areFriends(ctx, viewerId, target._id);
}

/** Insert a notification (no-op when notifying yourself). */
async function notifyFriend(
  ctx: MutationCtx,
  recipient: Id<"users">,
  actor: Id<"users">,
  type: "friend_request" | "friend_accept",
) {
  if (recipient === actor) return;
  await ctx.db.insert("notifications", {
    userId: recipient,
    type,
    actorId: actor,
    read: false,
    createdAt: Date.now(),
  });
}

type FriendState = "self" | "none" | "outgoing" | "incoming" | "friends";

/** The viewer's friendship state toward a user (by username). */
export const friendStatus = query({
  args: { username: v.string() },
  handler: async (ctx, { username }): Promise<{ status: FriendState } | null> => {
    const viewer = await getCurrentUser(ctx);
    const target = await userByUsername(ctx, username);
    if (!target) return null;
    if (viewer && viewer._id === target._id) return { status: "self" };
    if (!viewer) return { status: "none" };
    const f = await getFriendship(ctx, viewer._id, target._id);
    if (!f) return { status: "none" };
    if (f.status === "accepted") return { status: "friends" };
    return { status: f.requestedBy === viewer._id ? "outgoing" : "incoming" };
  },
});

/** Send a request (or accept a pending incoming one → instant friends). */
export const sendFriendRequest = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }): Promise<{ status: FriendState }> => {
    const user = await requireUser(ctx);
    if (!user.username) {
      throw new ConvexError("Set a username before adding friends.");
    }
    const target = await userByUsername(ctx, username);
    if (!target) throw new ConvexError("User not found.");
    if (target._id === user._id) throw new ConvexError("That's you.");

    const existing = await getFriendship(ctx, user._id, target._id);
    const now = Date.now();
    if (!existing) {
      const { userA, userB } = pair(user._id, target._id);
      await ctx.db.insert("friendships", {
        userA,
        userB,
        status: "pending",
        requestedBy: user._id,
        createdAt: now,
        updatedAt: now,
      });
      await notifyFriend(ctx, target._id, user._id, "friend_request");
      return { status: "outgoing" };
    }
    if (existing.status === "accepted") return { status: "friends" };
    if (existing.requestedBy === user._id) return { status: "outgoing" };
    // A pending request from them + you adding back = mutual → accept.
    await ctx.db.patch("friendships", existing._id, {
      status: "accepted",
      updatedAt: now,
    });
    await notifyFriend(ctx, existing.requestedBy, user._id, "friend_accept");
    return { status: "friends" };
  },
});

/** Accept a pending incoming request from `username`. */
export const acceptFriendRequest = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }): Promise<{ status: FriendState }> => {
    const user = await requireUser(ctx);
    const target = await userByUsername(ctx, username);
    if (!target) throw new ConvexError("User not found.");
    const f = await getFriendship(ctx, user._id, target._id);
    if (!f || f.status !== "pending" || f.requestedBy === user._id) {
      return { status: f?.status === "accepted" ? "friends" : "none" };
    }
    await ctx.db.patch("friendships", f._id, {
      status: "accepted",
      updatedAt: Date.now(),
    });
    await notifyFriend(ctx, f.requestedBy, user._id, "friend_accept");
    return { status: "friends" };
  },
});

/** Cancel a request, decline one, or unfriend — deletes the pair row. */
export const removeFriend = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }): Promise<{ status: FriendState }> => {
    const user = await requireUser(ctx);
    const target = await userByUsername(ctx, username);
    if (!target) return { status: "none" };
    const f = await getFriendship(ctx, user._id, target._id);
    if (f) await ctx.db.delete("friendships", f._id);
    return { status: "none" };
  },
});
