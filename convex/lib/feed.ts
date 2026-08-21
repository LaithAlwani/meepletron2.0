import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Keep a play's feed post in sync with its visibility. A public play has exactly
 * one `posts` row (kind "play") pointing at it; a private play has none. Called
 * from the play mutations so "make public/private" adds/removes the feed post.
 */
export async function syncPlayPost(
  ctx: MutationCtx,
  play: { _id: Id<"plays">; userId: Id<"users">; visibility: "public" | "private" },
) {
  const existing = await ctx.db
    .query("posts")
    .withIndex("by_play", (q) => q.eq("playId", play._id))
    .unique();
  if (play.visibility === "public") {
    if (!existing) {
      const now = Date.now();
      await ctx.db.insert("posts", {
        userId: play.userId,
        kind: "play",
        playId: play._id,
        visibility: "public",
        reactionCount: 0,
        commentCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  } else if (existing) {
    await clearPostSocial(ctx, existing._id);
    await ctx.db.delete("posts", existing._id);
  }
}

/** Remove a play's feed post (+ its likes/comments), if any. On play delete. */
export async function deletePlayPost(ctx: MutationCtx, playId: Id<"plays">) {
  const post = await ctx.db
    .query("posts")
    .withIndex("by_play", (q) => q.eq("playId", playId))
    .unique();
  if (!post) return;
  await clearPostSocial(ctx, post._id);
  await ctx.db.delete("posts", post._id);
}

/** Delete a post's likes, comments, and comment-likes (cascade on post delete). */
export async function clearPostSocial(ctx: MutationCtx, postId: Id<"posts">) {
  const reactions = await ctx.db
    .query("postReactions")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .collect();
  for (const r of reactions) await ctx.db.delete("postReactions", r._id);
  const comments = await ctx.db
    .query("postComments")
    .withIndex("by_post_and_created", (q) => q.eq("postId", postId))
    .collect();
  for (const c of comments) {
    const likes = await ctx.db
      .query("postCommentReactions")
      .withIndex("by_comment", (q) => q.eq("commentId", c._id))
      .collect();
    for (const l of likes) await ctx.db.delete("postCommentReactions", l._id);
    await ctx.db.delete("postComments", c._id);
  }
}
