/**
 * Pure, JS-side library filter predicates over a game doc. Shared by the library
 * grid (games.ts) and the collection lists (bggSync.ts) so "filter my collection"
 * behaves exactly like "filter the library". No Convex ctx — safe anywhere.
 */
import type { Doc } from "../_generated/dataModel";

export type LibraryTime = "quick" | "standard" | "epic";

/** True when the game carries ANY of the selected values (empty selection = no filter). */
export function hasAnyValue(
  gameVals: string[],
  selected: string[] | undefined,
): boolean {
  if (!selected || selected.length === 0) return true;
  const set = new Set(gameVals.map((v) => v.trim().toLowerCase()));
  return selected.some((s) => set.has(s.trim().toLowerCase()));
}

/** Players / play-time / has-expansions — the scalar library filters. */
export function matchesPlayersTime(
  g: Doc<"games">,
  players?: number,
  time?: LibraryTime,
  hasExpansions?: boolean,
): boolean {
  if (players != null) {
    if (
      g.minPlayers == null ||
      g.maxPlayers == null ||
      g.minPlayers > players ||
      g.maxPlayers < players
    ) {
      return false;
    }
  }
  if (time === "quick" && !(g.maxPlayTime != null && g.maxPlayTime <= 30)) {
    return false;
  }
  if (
    time === "standard" &&
    !(g.maxPlayTime != null && g.maxPlayTime > 30 && g.maxPlayTime <= 90)
  ) {
    return false;
  }
  if (time === "epic" && !(g.maxPlayTime != null && g.maxPlayTime > 90)) {
    return false;
  }
  if (hasExpansions && !g.hasExpansions) return false;
  return true;
}

export type GameFilters = {
  term?: string;
  players?: number;
  time?: LibraryTime;
  hasExpansions?: boolean;
  categories?: string[];
  mechanics?: string[];
};

/**
 * Every game-based library filter EXCEPT chat-ready (which needs a DB lookup for
 * the ingested set). Pass `term` only where you want a substring match on the
 * game's denormalized search blob — callers using a search index leave it unset.
 */
export function matchesGameFilters(g: Doc<"games">, f: GameFilters): boolean {
  if (!matchesPlayersTime(g, f.players, f.time, f.hasExpansions)) return false;
  if (!hasAnyValue(g.categories, f.categories)) return false;
  if (!hasAnyValue(g.gameMechanics, f.mechanics)) return false;
  if (f.term) {
    const terms = f.term.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hay = (g.searchText ?? g.title).toLowerCase();
    if (!terms.every((t) => hay.includes(t))) return false;
  }
  return true;
}
