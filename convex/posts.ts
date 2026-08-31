import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getCurrentUser, requireUser } from "./lib/auth";

const SITE_URL = process.env.SITE_URL || "https://www.meepletron.com";

/**
 * A `posts` row backs a public play's social layer — its likes + comments — plus
 * the notifications those actions generate. (Photo/toplist "posts" and the home
 * feed were removed; a play's post is created/removed by its visibility via
 * convex/lib/feed.ts's syncPlayPost.)
 *
 * Conventions mirror convex/plays.ts: reads use getCurrentUser, writes use
 * requireUser + an ownership check, two-arg ctx.db.get, bounded reads.
 */

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Public author info for a post / comment — the username, never the real name. */
async function postOwner(ctx: QueryCtx, userId: Id<"users">) {
  const u = await ctx.db.get("users", userId);
  const avatarUrl = u?.avatarStorageId
    ? await ctx.storage.getUrl(u.avatarStorageId)
    : (u?.image ?? null);
  return {
    name: u?.username ?? "Player",
    username: u?.username ?? null,
    avatarUrl,
  };
}

/** Create a notification for a recipient. No-op when you'd notify yourself; a
 *  repeated like from the same actor on the same post doesn't stack. */
async function notify(
  ctx: MutationCtx,
  n: {
    userId: Id<"users">;
    type: "post_like" | "post_comment" | "comment_like" | "comment_mention";
    actorId: Id<"users">;
    postId?: Id<"posts">;
    commentId?: Id<"postComments">;
  },
) {
  if (n.userId === n.actorId) return;
  if (n.type === "post_like" && n.postId) {
    const recent = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_created", (q) => q.eq("userId", n.userId))
      .order("desc")
      .take(50);
    if (
      recent.some(
        (d) =>
          d.type === "post_like" &&
          d.postId === n.postId &&
          d.actorId === n.actorId &&
          !d.read,
      )
    ) {
      return;
    }
  }
  await ctx.db.insert("notifications", {
    ...n,
    read: false,
    createdAt: Date.now(),
  });
}

/* -------------------------------------------------------------------------- */
/* Reactions + comments                                                       */
/* -------------------------------------------------------------------------- */

/** Toggle the caller's like on a post. Returns the new state. */
export const toggleReaction = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const user = await requireUser(ctx);
    const post = await ctx.db.get("posts", postId);
    if (!post) throw new Error("Post not found");
    const existing = await ctx.db
      .query("postReactions")
      .withIndex("by_user_and_post", (q) =>
        q.eq("userId", user._id).eq("postId", postId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete("postReactions", existing._id);
      await ctx.db.patch("posts", postId, {
        reactionCount: Math.max(0, (post.reactionCount ?? 0) - 1),
      });
      return { reacted: false };
    }
    await ctx.db.insert("postReactions", {
      postId,
      userId: user._id,
      createdAt: Date.now(),
    });
    await ctx.db.patch("posts", postId, {
      reactionCount: (post.reactionCount ?? 0) + 1,
    });
    await notify(ctx, {
      userId: post.userId,
      type: "post_like",
      actorId: user._id,
      postId,
    });
    return { reacted: true };
  },
});

export const addComment = mutation({
  args: { postId: v.id("posts"), text: v.string() },
  handler: async (ctx, { postId, text }) => {
    const user = await requireUser(ctx);
    const body = text.trim().slice(0, 2000);
    if (!body) return;
    const post = await ctx.db.get("posts", postId);
    if (!post) throw new Error("Post not found");
    if (post.visibility !== "public" && post.userId !== user._id) {
      throw new Error("You can't comment on this post.");
    }
    const commentId = await ctx.db.insert("postComments", {
      postId,
      userId: user._id,
      text: body,
      createdAt: Date.now(),
    });
    await ctx.db.patch("posts", postId, {
      commentCount: (post.commentCount ?? 0) + 1,
    });
    // Shared context for the optional email nudges (posts are play-backed).
    const actorName = user.username ?? user.name ?? "Someone";
    const snippet = body.slice(0, 140);
    const playUrl =
      post.kind === "play" && post.playId
        ? `${SITE_URL}/plays/${post.playId}`
        : `${SITE_URL}/notifications`;
    const playTitle =
      post.kind === "play" && post.playId
        ? ((await ctx.db.get("plays", post.playId))?.title ?? "your play")
        : "your post";

    // Notify the post owner, plus anyone @mentioned in the comment.
    await notify(ctx, {
      userId: post.userId,
      type: "post_comment",
      actorId: user._id,
      postId,
      commentId,
    });
    if (post.userId !== user._id) {
      const owner = await ctx.db.get("users", post.userId);
      if (owner?.email && (owner.preferences?.emailComments ?? true)) {
        await ctx.scheduler.runAfter(0, internal.email.sendNotificationEmail, {
          to: owner.email,
          recipientName: owner.username ?? owner.name ?? undefined,
          subject: `${actorName} commented on your play`,
          heading: `${actorName} commented on ${playTitle}`,
          body: `“${snippet}”`,
          ctaLabel: "See the play",
          ctaUrl: playUrl,
          footerNote:
            "You're receiving this because someone commented on your play on Meepletron.",
        });
      }
    }

    const mentioned = new Set<string>();
    for (const m of body.matchAll(/@(\w{2,30})/g)) {
      mentioned.add(m[1].toLowerCase());
    }
    for (const uname of mentioned) {
      const u = await ctx.db
        .query("users")
        .withIndex("by_username_lower", (q) => q.eq("usernameLower", uname))
        .unique();
      if (u && u._id !== post.userId && u._id !== user._id) {
        await notify(ctx, {
          userId: u._id,
          type: "comment_mention",
          actorId: user._id,
          postId,
          commentId,
        });
        if (u.email && (u.preferences?.emailMentions ?? true)) {
          await ctx.scheduler.runAfter(0, internal.email.sendNotificationEmail, {
            to: u.email,
            recipientName: u.username ?? u.name ?? undefined,
            subject: `${actorName} mentioned you in a comment`,
            heading: `${actorName} mentioned you`,
            body: `“${snippet}”`,
            ctaLabel: "See the comment",
            ctaUrl: playUrl,
            footerNote:
              "You're receiving this because someone mentioned you in a comment on Meepletron.",
          });
        }
      }
    }
  },
});

export const editComment = mutation({
  args: { commentId: v.id("postComments"), text: v.string() },
  handler: async (ctx, { commentId, text }) => {
    const user = await requireUser(ctx);
    const c = await ctx.db.get("postComments", commentId);
    if (!c || c.userId !== user._id) throw new Error("Comment not found");
    const body = text.trim().slice(0, 2000);
    if (!body) return;
    await ctx.db.patch("postComments", commentId, {
      text: body,
      editedAt: Date.now(),
    });
  },
});

export const deleteComment = mutation({
  args: { commentId: v.id("postComments") },
  handler: async (ctx, { commentId }) => {
    const user = await requireUser(ctx);
    const c = await ctx.db.get("postComments", commentId);
    if (!c) return;
    const post = await ctx.db.get("posts", c.postId);
    // The comment's author, or the post's owner, may delete it.
    if (c.userId !== user._id && post?.userId !== user._id) return;
    const likes = await ctx.db
      .query("postCommentReactions")
      .withIndex("by_comment", (q) => q.eq("commentId", commentId))
      .collect();
    for (const l of likes) await ctx.db.delete("postCommentReactions", l._id);
    await ctx.db.delete("postComments", commentId);
    if (post) {
      await ctx.db.patch("posts", c.postId, {
        commentCount: Math.max(0, (post.commentCount ?? 0) - 1),
      });
    }
    // Drop notifications that pointed at this comment.
    const notes = await ctx.db
      .query("notifications")
      .withIndex("by_post", (q) => q.eq("postId", c.postId))
      .collect();
    for (const nt of notes) {
      if (nt.commentId === commentId) await ctx.db.delete("notifications", nt._id);
    }
  },
});

export const listComments = query({
  args: { postId: v.id("posts"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { postId, paginationOpts }) => {
    const viewer = await getCurrentUser(ctx);
    const post = await ctx.db.get("posts", postId);
    const empty = { page: [], isDone: true, continueCursor: "" };
    if (!post) return empty;
    const isOwner = viewer != null && viewer._id === post.userId;
    if (post.visibility !== "public" && !isOwner) return empty;

    const result = await ctx.db
      .query("postComments")
      .withIndex("by_post_and_created", (q) => q.eq("postId", postId))
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (c) => ({
          _id: c._id,
          text: c.text,
          createdAt: c.createdAt,
          editedAt: c.editedAt ?? null,
          author: await postOwner(ctx, c.userId),
          canEdit: viewer != null && viewer._id === c.userId,
          likeCount: c.likeCount ?? 0,
          myLike:
            viewer != null &&
            (await ctx.db
              .query("postCommentReactions")
              .withIndex("by_user_and_comment", (q) =>
                q.eq("userId", viewer._id).eq("commentId", c._id),
              )
              .unique()) != null,
          canDelete:
            viewer != null &&
            (viewer._id === c.userId || viewer._id === post.userId),
        })),
      ),
    };
  },
});

/** Toggle the caller's like on a comment. */
export const toggleCommentReaction = mutation({
  args: { commentId: v.id("postComments") },
  handler: async (ctx, { commentId }) => {
    const user = await requireUser(ctx);
    const c = await ctx.db.get("postComments", commentId);
    if (!c) throw new Error("Comment not found");
    const existing = await ctx.db
      .query("postCommentReactions")
      .withIndex("by_user_and_comment", (q) =>
        q.eq("userId", user._id).eq("commentId", commentId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete("postCommentReactions", existing._id);
      await ctx.db.patch("postComments", commentId, {
        likeCount: Math.max(0, (c.likeCount ?? 0) - 1),
      });
      return { liked: false };
    }
    await ctx.db.insert("postCommentReactions", {
      commentId,
      userId: user._id,
      createdAt: Date.now(),
    });
    await ctx.db.patch("postComments", commentId, {
      likeCount: (c.likeCount ?? 0) + 1,
    });
    await notify(ctx, {
      userId: c.userId,
      type: "comment_like",
      actorId: user._id,
      postId: c.postId,
      commentId,
    });
    return { liked: true };
  },
});

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

/** Enrich a notification with its actor + a small preview for the UI. */
async function notificationView(ctx: QueryCtx, nt: Doc<"notifications">) {
  const actor = await postOwner(ctx, nt.actorId);
  let postKind: "play" | "image" | "toplist" | null = null;
  let title: string | null = null;
  let thumbUrl: string | null = null;
  let snippet: string | null = null;
  // Post likes/comments are all on play posts now — resolve the play so the
  // notification links straight to it (there's no post permalink page anymore).
  let playId: Id<"plays"> | null = nt.playId ?? null;
  if (nt.postId) {
    const post = await ctx.db.get("posts", nt.postId);
    if (post) {
      postKind = post.kind;
      if (post.kind === "play" && post.playId) {
        playId = post.playId;
        title = (await ctx.db.get("plays", post.playId))?.title ?? null;
      } else if (post.kind === "toplist" && post.topListId) {
        title =
          (await ctx.db.get("topGamesLists", post.topListId))?.title ??
          "Top Games list";
      } else if (post.kind === "image") {
        const first = post.photoIds?.[0];
        thumbUrl = first ? await ctx.storage.getUrl(first) : null;
      }
    }
  }
  if (nt.playId) {
    // play_tagged — link straight to the play.
    title = (await ctx.db.get("plays", nt.playId))?.title ?? null;
  }
  if (nt.commentId) {
    snippet = (await ctx.db.get("postComments", nt.commentId))?.text.slice(0, 120) ?? null;
  }
  return {
    _id: nt._id,
    type: nt.type,
    read: nt.read,
    createdAt: nt.createdAt,
    actor,
    postId: nt.postId ?? null,
    playId,
    postKind,
    title,
    thumbUrl,
    snippet,
  };
}

/** The caller's notifications, newest first. */
export const myNotifications = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return { page: [], isDone: true, continueCursor: "" };
    const result = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_created", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(result.page.map((n) => notificationView(ctx, n))),
    };
  },
});

/** Unread count for the bell badge (capped at 99 for display). */
export const unreadNotificationCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return 0;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) =>
        q.eq("userId", user._id).eq("read", false),
      )
      .take(100);
    return unread.length;
  },
});

/** Mark all of the caller's notifications read (batched). */
export const markNotificationsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) =>
        q.eq("userId", user._id).eq("read", false),
      )
      .take(200);
    for (const n of unread) {
      await ctx.db.patch("notifications", n._id, { read: true });
    }
    return unread.length;
  },
});
