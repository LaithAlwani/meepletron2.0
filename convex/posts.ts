import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  internalMutation,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getCurrentUser, requireUser } from "./lib/auth";
import { clearPostSocial } from "./lib/feed";
import { playCard, keepImages } from "./plays";
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

const MIGRATE_BATCH = 100;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Public author info for a post / comment. */
async function postOwner(ctx: QueryCtx, userId: Id<"users">) {
  const u = await ctx.db.get("users", userId);
  const avatarUrl = u?.avatarStorageId
    ? await ctx.storage.getUrl(u.avatarStorageId)
    : (u?.image ?? null);
  return {
    name: u?.name ?? u?.username ?? "Player",
    username: u?.username ?? null,
    avatarUrl,
  };
}

async function urlsOf(ctx: QueryCtx, ids?: Id<"_storage">[]) {
  const urls = await Promise.all((ids ?? []).map((id) => ctx.storage.getUrl(id)));
  return urls.filter((u): u is string => !!u);
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
    owner: await postOwner(ctx, post.userId),
    reactionCount: post.reactionCount ?? 0,
    commentCount: post.commentCount ?? 0,
    myReaction,
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
    await ctx.db.insert("postComments", {
      postId,
      userId: user._id,
      text: body,
      createdAt: Date.now(),
    });
    await ctx.db.patch("posts", postId, {
      commentCount: (post.commentCount ?? 0) + 1,
    });
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
    return { liked: true };
  },
});

/* -------------------------------------------------------------------------- */
/* Migration: create posts for existing public plays + move their social       */
/* -------------------------------------------------------------------------- */

/**
 * One-time, idempotent, cursor-paged: for each public play create a "play" post
 * (if missing) and move its `playReactions`/`playComments`(+`commentReactions`)
 * into the new `postReactions`/`postComments`/`postCommentReactions` tables.
 * Run: `npx convex run posts:backfillFromPlays`. Safe to re-run.
 */
export const backfillFromPlays = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const batch = await ctx.db
      .query("plays")
      .withIndex("by_visibility_and_date", (q) => q.eq("visibility", "public"))
      .paginate({ numItems: MIGRATE_BATCH, cursor: cursor ?? null });

    let created = 0;
    for (const play of batch.page) {
      let post = await ctx.db
        .query("posts")
        .withIndex("by_play", (q) => q.eq("playId", play._id))
        .unique();
      if (!post) {
        const id = await ctx.db.insert("posts", {
          userId: play.userId,
          kind: "play",
          playId: play._id,
          visibility: "public",
          reactionCount: play.reactionCount ?? 0,
          commentCount: play.commentCount ?? 0,
          createdAt: play.createdAt,
          updatedAt: play.updatedAt,
        });
        post = await ctx.db.get("posts", id);
        created++;
      }
      if (!post) continue;

      const reactions = await ctx.db
        .query("playReactions")
        .withIndex("by_play", (q) => q.eq("playId", play._id))
        .collect();
      for (const r of reactions) {
        const dup = await ctx.db
          .query("postReactions")
          .withIndex("by_user_and_post", (q) =>
            q.eq("userId", r.userId).eq("postId", post._id),
          )
          .unique();
        if (!dup) {
          await ctx.db.insert("postReactions", {
            postId: post._id,
            userId: r.userId,
            createdAt: r.createdAt,
          });
        }
        await ctx.db.delete("playReactions", r._id);
      }

      const comments = await ctx.db
        .query("playComments")
        .withIndex("by_play_and_created", (q) => q.eq("playId", play._id))
        .collect();
      for (const c of comments) {
        const newId = await ctx.db.insert("postComments", {
          postId: post._id,
          userId: c.userId,
          text: c.text,
          createdAt: c.createdAt,
          editedAt: c.editedAt,
          likeCount: c.likeCount,
        });
        const cLikes = await ctx.db
          .query("commentReactions")
          .withIndex("by_comment", (q) => q.eq("commentId", c._id))
          .collect();
        for (const l of cLikes) {
          await ctx.db.insert("postCommentReactions", {
            commentId: newId,
            userId: l.userId,
            createdAt: l.createdAt,
          });
          await ctx.db.delete("commentReactions", l._id);
        }
        await ctx.db.delete("playComments", c._id);
      }
    }

    if (!batch.isDone) {
      await ctx.scheduler.runAfter(0, internal.posts.backfillFromPlays, {
        cursor: batch.continueCursor,
      });
    }
    return { done: batch.isDone, created };
  },
});
