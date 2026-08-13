import { v } from "convex/values";

/**
 * Cached BoardGameGeek stats for a game. Single source of truth shared by the
 * schema, the `games` mutations (Fill from BGG), and `bgg.setBggStats` so they
 * never drift. `playerPoll` holds raw vote counts per player count; `plus` marks
 * the trailing "N+" bucket (e.g. "6+").
 */
export const bggStatsValidator = v.object({
  rating: v.optional(v.number()),
  ratingCount: v.optional(v.number()),
  weight: v.optional(v.number()),
  pollVotes: v.optional(v.number()),
  playerPoll: v.optional(
    v.array(
      v.object({
        count: v.number(),
        plus: v.optional(v.boolean()),
        best: v.number(),
        recommended: v.number(),
        notRecommended: v.number(),
      }),
    ),
  ),
  fetchedAt: v.optional(v.number()),
});
