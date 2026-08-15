import { v } from "convex/values";

/**
 * Shapes shared by the schema and the sync functions' args, defined once here so
 * the two can't drift (same convention as ./bggStats).
 *
 * The `*Item` validators are what the parser hands to the import mutations; the
 * `*Row` validators extend them with the fields we add on write.
 */

/** One participant in a logged play. Bounded (~≤20), so it stays embedded. */
export const bggPlayPlayerValidator = v.object({
  name: v.string(),
  username: v.optional(v.string()),
  // BGG scores are free-form text ("12", "3.5", "-4", ""), not numbers.
  score: v.optional(v.string()),
  win: v.optional(v.boolean()),
  isNew: v.optional(v.boolean()),
  color: v.optional(v.string()),
});

/** One item as parsed out of a /collection response. */
export const bggCollectionItemValidator = v.object({
  bggId: v.string(),
  title: v.string(),
  year: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  isExpansion: v.boolean(),
  // <status/> flags
  own: v.boolean(),
  prevOwned: v.optional(v.boolean()),
  forTrade: v.optional(v.boolean()),
  want: v.optional(v.boolean()),
  wantToPlay: v.optional(v.boolean()),
  wishlist: v.optional(v.boolean()),
  // THEIR rating and play count, not the global average.
  userRating: v.optional(v.number()),
  numPlays: v.optional(v.number()),
  comment: v.optional(v.string()),
});

/** A stored collection row: the parsed item plus what we add on write. */
export const bggCollectionRowValidator = bggCollectionItemValidator.extend({
  userId: v.id("users"),
  // Linked to a local game — always set once stub creation is on, but optional
  // so a row survives its game being deleted.
  gameId: v.optional(v.id("games")),
  // Lowercased title, so alphabetical pagination is an index scan.
  sortTitle: v.string(),
  // Stamped with the run's `runStartedAt`; rows left behind by a run are swept.
  syncedAt: v.number(),
});

/** One play as parsed out of a /plays response. */
export const bggPlayItemValidator = v.object({
  playId: v.string(),
  bggId: v.string(),
  title: v.string(),
  date: v.string(), // "YYYY-MM-DD" — lexicographically sortable
  quantity: v.number(),
  lengthMinutes: v.optional(v.number()),
  incomplete: v.optional(v.boolean()),
  location: v.optional(v.string()),
  comments: v.optional(v.string()),
  players: v.optional(v.array(bggPlayPlayerValidator)),
});

/** A stored play row. */
export const bggPlayRowValidator = bggPlayItemValidator.extend({
  userId: v.id("users"),
  gameId: v.optional(v.id("games")),
  syncedAt: v.number(),
});

/** Which of a user's two sync pipelines a job belongs to. */
export const bggSyncKindValidator = v.union(
  v.literal("collection"),
  v.literal("plays"),
);

/**
 * Job lifecycle. `waiting` is the BGG-said-202 state — distinct from `running`
 * so the UI can say "BoardGameGeek is preparing your collection" rather than
 * looking stalled.
 */
export const bggSyncStatusValidator = v.union(
  v.literal("queued"),
  v.literal("waiting"),
  v.literal("running"),
  v.literal("sweeping"),
  // Filling imported stub games with full metadata + covers from BGG, one at a
  // time — the slow, per-game phase the progress UI narrates.
  v.literal("enriching"),
  v.literal("done"),
  v.literal("error"),
  v.literal("canceled"),
);

/** Link state for a user's BGG account. */
export const bggAccountStatusValidator = v.union(
  v.literal("linked"),
  v.literal("needs_reauth"),
  v.literal("error"),
);
