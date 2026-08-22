import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, requireUser } from "./lib/auth";
import { canViewProfile } from "./friends";
import { postVisibilityValidator } from "./lib/postTypes";
import { clearPostSocial, syncPlayPost } from "./lib/feed";
import { playCard, keepImages, writePlayVisibility } from "./plays";
import { topListPreview } from "./topGames";

/**
 * The social feed. A `posts` row is one shared item — a play, an image post, or
 * a shared Top Games list — shown on the home feed with likes + comments.
 * `plays` stays the rich private-by-default record; posts reference it (and
 * `topGamesLists`) rather than duplicating, so the feed table holds only shared
 * content. See convex/lib/postTypes.ts + convex/lib/feed.ts (play↔post sync).
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

async function urlsOf(ctx: QueryCtx, ids?: Id<"_storage">[]) {
  const urls = await Promise.all((ids ?? []).map((id) => ctx.storage.getUrl(id)));
  return urls.filter((u): u is string => !!u);
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

/** Build one feed item from a post, resolving its referenced play/list/photos.
 *  Returns null when the referenced content is gone (the caller drops it). */
async function buildFeedItem(
  ctx: QueryCtx,
  viewer: Doc<"users"> | null,
  post: Doc<"posts">,
) {
  const myReaction =
    viewer != null &&
    (await ctx.db
      .query("postReactions")
      .withIndex("by_user_and_post", (q) =>
        q.eq("userId", viewer._id).eq("postId", post._id),
      )
      .unique()) != null;
  const base = {
    _id: post._id,
    caption: post.caption ?? null,
    createdAt: post.createdAt,
    editedAt: post.editedAt ?? null,
    owner: await postOwner(ctx, post.userId),
    reactionCount: post.reactionCount ?? 0,
    commentCount: post.commentCount ?? 0,
    myReaction,
    isMine: viewer != null && viewer._id === post.userId,
  };

  if (post.kind === "play") {
    if (!post.playId) return null;
    const play = await ctx.db.get("plays", post.playId);
    if (!play || play.visibility !== "public") return null;
    const card = await playCard(ctx, play);
    return {
      ...base,
      kind: "play" as const,
      playId: post.playId,
      title: card.title,
      gameSlug: card.gameSlug,
      coverUrl: card.coverUrl,
      date: card.date,
      format: card.format,
      playerCount: card.playerCount,
      players: card.players,
      winners: card.winners,
      photoUrls: await urlsOf(ctx, play.photoIds),
    };
  }

  if (post.kind === "image") {
    const photoUrls = await urlsOf(ctx, post.photoIds);
    if (photoUrls.length === 0) return null;
    return { ...base, kind: "image" as const, photoUrls };
  }

  // toplist
  if (!post.topListId) return null;
  const preview = await topListPreview(ctx, post.topListId);
  if (!preview) return null;
  const { title, listId, ...rest } = preview;
  return {
    ...base,
    kind: "toplist" as const,
    topListId: listId,
    listTitle: title,
    ...rest,
  };
}

/* -------------------------------------------------------------------------- */
/* Feed                                                                       */
/* -------------------------------------------------------------------------- */

/** The public home feed — everyone's shared posts, newest first. */
export const feed = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const viewer = await getCurrentUser(ctx);
    const result = await ctx.db
      .query("posts")
      .withIndex("by_visibility_and_created", (q) => q.eq("visibility", "public"))
      .order("desc")
      .paginate(paginationOpts);
    const page = (
      await Promise.all(result.page.map((p) => buildFeedItem(ctx, viewer, p)))
    ).filter((i): i is NonNullable<typeof i> => i !== null);
    return { ...result, page };
  },
});

/* -------------------------------------------------------------------------- */
/* Composer                                                                   */
/* -------------------------------------------------------------------------- */

/** Create an image post from already-compressed, uploaded photos. */
export const createImagePost = mutation({
  args: {
    photoIds: v.array(v.id("_storage")),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, { photoIds, caption }): Promise<Id<"posts">> => {
    const user = await requireUser(ctx);
    const kept = await keepImages(ctx, photoIds);
    if (!kept || kept.length === 0) {
      throw new Error("Add at least one photo.");
    }
    const now = Date.now();
    return await ctx.db.insert("posts", {
      userId: user._id,
      kind: "image",
      caption: caption?.trim() || undefined,
      photoIds: kept,
      visibility: "public",
      reactionCount: 0,
      commentCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Share one of the caller's finalized Top Games lists to the feed. */
export const createTopListPost = mutation({
  args: {
    topListId: v.id("topGamesLists"),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, { topListId, caption }): Promise<Id<"posts">> => {
    const user = await requireUser(ctx);
    const list = await ctx.db.get("topGamesLists", topListId);
    if (!list || list.userId !== user._id) throw new Error("List not found");
    if (list.status !== "finalized") {
      throw new Error("Finalize the list before sharing it.");
    }
    // Sharing makes a finalized list public so its page opens from the feed.
    if (list.visibility !== "public") {
      await ctx.db.patch("topGamesLists", topListId, {
        visibility: "public",
        updatedAt: Date.now(),
      });
    }
    const now = Date.now();
    return await ctx.db.insert("posts", {
      userId: user._id,
      kind: "toplist",
      topListId,
      caption: caption?.trim() || undefined,
      visibility: "public",
      reactionCount: 0,
      commentCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Share one of the caller's own plays to the feed with an optional caption.
 * Makes the play public if it isn't (which creates its feed post), sets the
 * caption, and bumps it to the top of the feed. Idempotent — one post per play.
 */
export const sharePlayPost = mutation({
  args: { playId: v.id("plays"), caption: v.optional(v.string()) },
  handler: async (ctx, { playId, caption }): Promise<Id<"posts"> | null> => {
    const user = await requireUser(ctx);
    const play = await ctx.db.get("plays", playId);
    if (!play || play.userId !== user._id) throw new Error("Play not found");

    const now = Date.now();
    // Make the play public so it appears in the feed (and on the profile).
    if (play.visibility !== "public") {
      await writePlayVisibility(ctx, playId, "public");
    }
    // Ensure the play's feed post exists.
    await syncPlayPost(ctx, { _id: playId, userId: user._id, visibility: "public" });
    const post = await ctx.db
      .query("posts")
      .withIndex("by_play", (q) => q.eq("playId", playId))
      .unique();
    if (!post) return null;
    // Set the caption and resurface it to the top of the feed.
    await ctx.db.patch("posts", post._id, {
      caption: caption?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
    return post._id;
  },
});

/** Delete the caller's own post (image / toplist / play-share) + its social. */
export const deletePost = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const user = await requireUser(ctx);
    const post = await ctx.db.get("posts", postId);
    if (!post || post.userId !== user._id) return;
    // An image post owns its photos; play/toplist posts only reference.
    if (post.kind === "image") {
      for (const id of post.photoIds ?? []) await ctx.storage.delete(id);
    }
    await clearPostSocial(ctx, postId);
    await ctx.db.delete("posts", postId);
  },
});

/** Hide/unhide an image or toplist post from the feed (its own visibility).
 *  Play posts are controlled via the play's visibility instead. */
export const setPostVisibility = mutation({
  args: { postId: v.id("posts"), visibility: postVisibilityValidator },
  handler: async (ctx, { postId, visibility }) => {
    const user = await requireUser(ctx);
    const post = await ctx.db.get("posts", postId);
    if (!post || post.userId !== user._id) return;
    await ctx.db.patch("posts", postId, { visibility, updatedAt: Date.now() });
  },
});

/** The raw, editable content of the caller's own post — used to seed the editor
 *  (which photos / play / list it currently points at, plus the caption). */
export const getPostForEdit = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const viewer = await getCurrentUser(ctx);
    const post = await ctx.db.get("posts", postId);
    if (!post || !viewer || post.userId !== viewer._id) return null;
    return {
      kind: post.kind,
      caption: post.caption ?? "",
      playId: post.playId ?? null,
      topListId: post.topListId ?? null,
      photos:
        post.kind === "image"
          ? await Promise.all(
              (post.photoIds ?? []).map(async (id) => ({
                id,
                url: await ctx.storage.getUrl(id),
              })),
            )
          : [],
    };
  },
});

/**
 * Edit the caller's own post — the caption, and (for a mistake) which play,
 * image set, or Top Games list it shows. Stamps `editedAt` so the feed shows an
 * "Edited" marker with the new time. Only the fields for the post's kind apply.
 */
export const editPost = mutation({
  args: {
    postId: v.id("posts"),
    caption: v.optional(v.string()),
    photoIds: v.optional(v.array(v.id("_storage"))), // kind "image"
    topListId: v.optional(v.id("topGamesLists")), // kind "toplist"
    playId: v.optional(v.id("plays")), // kind "play"
  },
  handler: async (ctx, { postId, caption, photoIds, topListId, playId }) => {
    const user = await requireUser(ctx);
    const post = await ctx.db.get("posts", postId);
    if (!post || post.userId !== user._id) throw new Error("Post not found");
    const now = Date.now();
    const patch: Partial<Doc<"posts">> = {
      caption: caption?.trim() || undefined,
      updatedAt: now,
      editedAt: now,
    };

    if (post.kind === "image" && photoIds) {
      const kept = await keepImages(ctx, photoIds);
      if (!kept || kept.length === 0) throw new Error("Add at least one photo.");
      // Delete blobs that were dropped from this post (they're post-owned).
      const keptSet = new Set<string>(kept);
      for (const id of post.photoIds ?? []) {
        if (!keptSet.has(id)) await ctx.storage.delete(id);
      }
      patch.photoIds = kept;
    }

    if (post.kind === "toplist" && topListId && topListId !== post.topListId) {
      const list = await ctx.db.get("topGamesLists", topListId);
      if (!list || list.userId !== user._id) throw new Error("List not found");
      if (list.status !== "finalized") {
        throw new Error("Finalize the list before sharing it.");
      }
      if (list.visibility !== "public") {
        await ctx.db.patch("topGamesLists", topListId, {
          visibility: "public",
          updatedAt: now,
        });
      }
      patch.topListId = topListId;
    }

    if (post.kind === "play" && playId && playId !== post.playId) {
      const target = await ctx.db.get("plays", playId);
      if (!target || target.userId !== user._id) throw new Error("Play not found");
      // A play has exactly one feed post — don't create a second one.
      const targetPost = await ctx.db
        .query("posts")
        .withIndex("by_play", (q) => q.eq("playId", playId))
        .unique();
      if (targetPost && targetPost._id !== post._id) {
        throw new Error("That play is already shared to your feed.");
      }
      // Point this post at the new play (public); the old play loses its post.
      if (target.visibility !== "public") {
        await writePlayVisibility(ctx, playId, "public");
      }
      if (post.playId) {
        await writePlayVisibility(ctx, post.playId, "private");
      }
      patch.playId = playId;
    }

    await ctx.db.patch("posts", postId, patch);
  },
});

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
    // Notify the post owner, plus anyone @mentioned in the comment.
    await notify(ctx, {
      userId: post.userId,
      type: "post_comment",
      actorId: user._id,
      postId,
      commentId,
    });
    const mentioned = new Set<string>();
    for (const m of body.matchAll(/@(\w{2,30})/g)) {
      mentioned.add(m[1].toLowerCase());
    }
    for (const uname of mentioned) {
      const u = await ctx.db
        .query("users")
        .withIndex("by_username_lower", (q) => q.eq("usernameLower", uname))
        .unique();
      if (u && u._id !== post.userId) {
        await notify(ctx, {
          userId: u._id,
          type: "comment_mention",
          actorId: user._id,
          postId,
          commentId,
        });
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
/* Permalink + profile                                                        */
/* -------------------------------------------------------------------------- */

/** A single post for its permalink page (/posts/[id]). Public, or the owner's. */
export const getPost = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const viewer = await getCurrentUser(ctx);
    const post = await ctx.db.get("posts", postId);
    if (!post) return null;
    if (post.visibility !== "public" && (!viewer || viewer._id !== post.userId)) {
      return null;
    }
    return await buildFeedItem(ctx, viewer, post);
  },
});

/** A user's public image posts — the photo grid on their profile. */
export const userImagePosts = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const lower = username.trim().toLowerCase();
    if (!lower) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_username_lower", (q) => q.eq("usernameLower", lower))
      .unique();
    if (!user) return [];
    const viewer = await getCurrentUser(ctx);
    if (!(await canViewProfile(ctx, user, viewer?._id ?? null))) return [];
    const rows = await ctx.db
      .query("posts")
      .withIndex("by_user_and_created", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(60);
    const images = rows
      .filter((p) => p.kind === "image" && p.visibility === "public")
      .slice(0, 18);
    return await Promise.all(
      images.map(async (p) => ({
        _id: p._id,
        caption: p.caption ?? null,
        photoUrl:
          p.photoIds && p.photoIds[0]
            ? await ctx.storage.getUrl(p.photoIds[0])
            : null,
        photoCount: p.photoIds?.length ?? 0,
      })),
    );
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
  if (nt.postId) {
    const post = await ctx.db.get("posts", nt.postId);
    if (post) {
      postKind = post.kind;
      if (post.kind === "play" && post.playId) {
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
    playId: nt.playId ?? null,
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
