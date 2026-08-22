import { v } from "convex/values";

/**
 * Shapes for the social **feed** — the `posts` table and its reactions/comments.
 * A post is the unit shown on the home feed; it comes in three kinds:
 *   - "play"    → references a `plays` row (a shared game session)
 *   - "image"   → one or more uploaded photos + a caption
 *   - "toplist" → references a finalized `topGamesLists` row + a caption
 *
 * `plays` stays the rich, private-by-default record; a post is created only when
 * something is *shared*, so the feed table holds only shared content and never
 * the many private/BGG play rows. Reactions and comments key on the post id, so
 * they work uniformly across all three kinds.
 */

export const postKindValidator = v.union(
  v.literal("play"),
  v.literal("image"),
  v.literal("toplist"),
);

export const postVisibilityValidator = v.union(
  v.literal("private"),
  v.literal("public"),
);

/** A stored feed post. References plays/lists rather than duplicating them. */
export const postRowValidator = v.object({
  userId: v.id("users"), // author
  kind: postKindValidator,
  caption: v.optional(v.string()), // image / toplist body (and future play notes)
  playId: v.optional(v.id("plays")), // kind "play"
  topListId: v.optional(v.id("topGamesLists")), // kind "toplist"
  photoIds: v.optional(v.array(v.id("_storage"))), // kind "image"
  visibility: postVisibilityValidator, // the feed reads "public"
  reactionCount: v.optional(v.number()), // denormalized
  commentCount: v.optional(v.number()), // denormalized
  createdAt: v.number(),
  updatedAt: v.number(),
  editedAt: v.optional(v.number()), // set when the owner edits the caption
});

/** A "like" on a post — one per user, toggled. Count denormalized on the post. */
export const postReactionValidator = v.object({
  postId: v.id("posts"),
  userId: v.id("users"),
  createdAt: v.number(),
});

/** A comment on a public post. Count denormalized on the post. */
export const postCommentValidator = v.object({
  postId: v.id("posts"),
  userId: v.id("users"),
  text: v.string(),
  createdAt: v.number(),
  editedAt: v.optional(v.number()),
  likeCount: v.optional(v.number()), // denormalized
});

/** A "like" on a post comment — one per user, toggled. */
export const postCommentReactionValidator = v.object({
  commentId: v.id("postComments"),
  userId: v.id("users"),
  createdAt: v.number(),
});

/** An in-app notification for the recipient (`userId`) about someone's action. */
export const notificationValidator = v.object({
  userId: v.id("users"), // recipient
  type: v.union(
    v.literal("post_like"),
    v.literal("post_comment"),
    v.literal("comment_like"),
    v.literal("comment_mention"),
    v.literal("play_tagged"),
    v.literal("friend_request"),
    v.literal("friend_accept"),
  ),
  actorId: v.id("users"), // who triggered it
  postId: v.optional(v.id("posts")),
  commentId: v.optional(v.id("postComments")),
  playId: v.optional(v.id("plays")), // for play_tagged
  read: v.boolean(),
  createdAt: v.number(),
});

/**
 * A friendship (or pending request) between two accounts. Stored once per pair
 * with a canonical order (`userA` id < `userB` id); `requestedBy` records the
 * initiator so a pending row has a direction.
 */
export const friendshipValidator = v.object({
  userA: v.id("users"),
  userB: v.id("users"),
  status: v.union(v.literal("pending"), v.literal("accepted")),
  requestedBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
});
