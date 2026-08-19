/**
 * Library sort options + the denormalized sort keys derived from a game.
 *
 * The keys (sortTitle / yearNum / bggRating / bggRatingCount / bggWeight) are
 * stored top-level on each game and kept in sync at every write, so the library
 * can paginate ordered by any of these via an index — no catalogue scan. Shared
 * by the Convex backend (write paths + validation) and the app (sort dropdown).
 */

export type GameSortKey =
  | "rating"
  | "title"
  | "newest"
  | "year"
  | "weight"
  | "rated";

export const GAME_SORTS: { key: GameSortKey; label: string }[] = [
  { key: "rating", label: "Top rated" },
  { key: "title", label: "A–Z" },
  { key: "newest", label: "Newest added" },
  { key: "year", label: "Release year" },
  { key: "weight", label: "Complexity" },
  { key: "rated", label: "Most rated" },
];

export const DEFAULT_SORT: GameSortKey = "rating";

export const GAME_SORT_KEYS: readonly string[] = GAME_SORTS.map((s) => s.key);

export function isGameSort(key: string): key is GameSortKey {
  return (GAME_SORT_KEYS as string[]).includes(key);
}

type BggStats =
  | { rating?: number; ratingCount?: number; weight?: number }
  | undefined;

/** The BGG-derived sort keys (used on a stats-only refresh). */
export function bggSortKeys(bgg: BggStats): {
  bggRating?: number;
  bggRatingCount?: number;
  bggWeight?: number;
} {
  return {
    bggRating: bgg?.rating,
    bggRatingCount: bgg?.ratingCount,
    bggWeight: bgg?.weight,
  };
}

/** All denormalized sort keys for a game (title/year/bgg). */
export function sortKeys(input: {
  title: string;
  year?: string;
  bgg?: BggStats;
}): {
  sortTitle: string;
  yearNum?: number;
  bggRating?: number;
  bggRatingCount?: number;
  bggWeight?: number;
} {
  const y = input.year ? parseInt(input.year, 10) : NaN;
  return {
    sortTitle: input.title.trim().toLowerCase(),
    yearNum: Number.isFinite(y) ? y : undefined,
    ...bggSortKeys(input.bgg),
  };
}
