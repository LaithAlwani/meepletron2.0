import { v, ConvexError } from "convex/values";
import {
  query,
  mutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getCurrentUser, requireUser } from "./lib/auth";
import { imageUrl } from "./lib/media";

const SITE_URL = process.env.SITE_URL || "https://www.meepletron.com";

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
      // Optional email nudge (opt-out; default on).
      if (target.email && (target.preferences?.emailFriendRequests ?? true)) {
        const actorName = user.username ?? user.name ?? "Someone";
        await ctx.scheduler.runAfter(0, internal.email.sendNotificationEmail, {
          to: target.email,
          recipientName: target.username ?? target.name ?? undefined,
          subject: `${actorName} sent you a friend request on Meepletron`,
          heading: `${actorName} sent you a friend request 👋`,
          body: `${actorName} wants to connect with you on Meepletron. Add them back to share your plays, lists and collection.`,
          ctaLabel: `View ${actorName}'s profile`,
          ctaUrl: user.username
            ? `${SITE_URL}/user/${user.username}`
            : `${SITE_URL}/notifications`,
          footerNote:
            "You're receiving this because someone sent you a friend request on Meepletron.",
        });
      }
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

/** The ids of a user's accepted friends (the account holders on both sides). */
export async function acceptedFriendIds(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Id<"users">[]> {
  const a = await ctx.db
    .query("friendships")
    .withIndex("by_userA", (q) => q.eq("userA", userId))
    .collect();
  const b = await ctx.db
    .query("friendships")
    .withIndex("by_userB", (q) => q.eq("userB", userId))
    .collect();
  return [
    ...a.filter((f) => f.status === "accepted").map((f) => f.userB),
    ...b.filter((f) => f.status === "accepted").map((f) => f.userA),
  ];
}

/** How many accepted friends a user has. */
export async function friendCount(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<number> {
  return (await acceptedFriendIds(ctx, userId)).length;
}

/** A user's accepted friends (the account holders), for the profile list.
 *  Visible to anyone who may see the profile. */
export const listFriends = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const target = await userByUsername(ctx, username);
    if (!target) return [];
    const viewer = await getCurrentUser(ctx);
    if (!(await canViewProfile(ctx, target, viewer?._id ?? null))) return [];
    const a = await ctx.db
      .query("friendships")
      .withIndex("by_userA", (q) => q.eq("userA", target._id))
      .collect();
    const b = await ctx.db
      .query("friendships")
      .withIndex("by_userB", (q) => q.eq("userB", target._id))
      .collect();
    const otherIds = [
      ...a.filter((f) => f.status === "accepted").map((f) => f.userB),
      ...b.filter((f) => f.status === "accepted").map((f) => f.userA),
    ];
    const users = await Promise.all(otherIds.map((id) => ctx.db.get("users", id)));
    return await Promise.all(
      users
        .filter((u): u is Doc<"users"> => !!u)
        .map(async (u) => ({
          _id: u._id,
          name: u.username ?? u.name ?? "Player",
          username: u.username ?? null,
          avatarUrl:
            (await imageUrl(ctx, u.avatarKey, u.avatarStorageId)) ??
            u.image ??
            null,
        })),
    );
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
