import { v } from "convex/values";

/**
 * Shapes for the unified `plays` model, defined once so the schema and the
 * play mutations' args can't drift (same convention as ./bggStats,
 * ./bggSyncTypes). A play is one recorded game session; it may be entered by
 * hand or imported from BoardGameGeek (`source`).
 */

/** How the game was scored — drives the wizard's score step and winner logic. */
export const playFormatValidator = v.union(
  v.literal("competitive"), // free-for-all: points or placement
  v.literal("cooperative"), // everyone (or a solo player) wins/loses together
  v.literal("teams"), // 2–4 teams; the team wins
  v.literal("rounds"), // most rounds/hands won
  v.literal("onevsall"), // asymmetric: one/few vs the rest
);

/** For competitive plays: how points map to a winner. */
export const playScoreModeValidator = v.union(
  v.literal("highest"), // most points wins
  v.literal("lowest"), // fewest points wins (golf)
  v.literal("placement"), // no points, just 1st/2nd/3rd…
);

export const playVisibilityValidator = v.union(
  v.literal("private"),
  v.literal("public"),
);

export const playSourceValidator = v.union(
  v.literal("manual"),
  v.literal("bgg"),
);

export const coopOutcomeValidator = v.union(
  v.literal("win"),
  v.literal("loss"),
);

/** One participant in a play. Bounded (~≤20), so it stays embedded on the row. */
export const playPlayerValidator = v.object({
  name: v.string(), // display name, always set
  userId: v.optional(v.id("users")), // linked system user, when known
  personId: v.optional(v.id("playPeople")), // linked saved contact
  score: v.optional(v.number()),
  placement: v.optional(v.number()), // 1 = first, 2 = second…
  roundsWon: v.optional(v.number()), // for `rounds` format
  isWinner: v.optional(v.boolean()),
  teamIndex: v.optional(v.number()), // teams/onevsall (0-based)
  color: v.optional(v.string()),
  isNew: v.optional(v.boolean()), // first time this player played the game
});

/** A team in a team-based (or one-vs-all) play. */
export const playTeamValidator = v.object({
  name: v.string(),
  isWinner: v.optional(v.boolean()),
  score: v.optional(v.number()),
});

/** A stored play row. */
export const playRowValidator = v.object({
  userId: v.id("users"), // owner / logger
  gameId: v.optional(v.id("games")), // optional so a row survives game deletion
  bggId: v.optional(v.string()),
  title: v.string(), // denormalized game title
  date: v.string(), // "YYYY-MM-DD" — lexicographically sortable
  lengthMinutes: v.optional(v.number()),
  location: v.optional(v.string()),
  comments: v.optional(v.string()),
  format: playFormatValidator,
  scoreMode: v.optional(playScoreModeValidator),
  coopOutcome: v.optional(coopOutcomeValidator),
  // Optional shared score for a cooperative/solo play (many solos are score
  // chases). Distinct from per-player competitive scores.
  coopScore: v.optional(v.number()),
  teams: v.optional(v.array(playTeamValidator)),
  players: v.array(playPlayerValidator),
  photoIds: v.optional(v.array(v.id("_storage"))),
  visibility: playVisibilityValidator,
  source: playSourceValidator,
  bggPlayId: v.optional(v.string()), // idempotent BGG import key
  needsReview: v.optional(v.boolean()), // BGG import guessed the format
  reactionCount: v.optional(v.number()), // denormalized (deferred feed)
  commentCount: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/** An owner's saved non-system player, reusable across their plays. */
export const playPersonValidator = v.object({
  ownerId: v.id("users"),
  name: v.string(),
  emailLower: v.optional(v.string()),
  linkedUserId: v.optional(v.id("users")), // set once they sign up / are claimed
  playCount: v.optional(v.number()),
  createdAt: v.number(),
});

/**
 * An indexed link from a play to each identifiable participant, so "plays I was
 * in" and email-claim are index scans (the embedded `players[]` isn't queryable).
 */
export const playParticipantValidator = v.object({
  playId: v.id("plays"),
  ownerId: v.id("users"),
  gameId: v.optional(v.id("games")),
  date: v.string(),
  visibility: playVisibilityValidator,
  userId: v.optional(v.id("users")),
  emailLower: v.optional(v.string()),
});

/** A "like" on a play — one per user (toggled). Count is denormalized on plays. */
export const playReactionValidator = v.object({
  playId: v.id("plays"),
  userId: v.id("users"),
  createdAt: v.number(),
});

/** A comment on a public play. Count is denormalized on plays. */
export const playCommentValidator = v.object({
  playId: v.id("plays"),
  userId: v.id("users"),
  text: v.string(),
  createdAt: v.number(),
  editedAt: v.optional(v.number()),
  likeCount: v.optional(v.number()), // denormalized
});

/** A "like" on a comment — one per user (toggled). */
export const commentReactionValidator = v.object({
  commentId: v.id("playComments"),
  userId: v.id("users"),
  createdAt: v.number(),
});
