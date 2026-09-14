"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SORT, isGameSort, type GameSortKey } from "@/convex/lib/gameSort";

export type TimeFilter = "quick" | "standard" | "epic";

export type LibraryFilterState = {
  players: number | null;
  time: TimeFilter | null;
  hasExpansions: boolean;
  chatOnly: boolean;
  categories: string[];
  mechanics: string[];
};

export const EMPTY_FILTERS: LibraryFilterState = {
  players: null,
  time: null,
  hasExpansions: false,
  chatOnly: false,
  categories: [],
  mechanics: [],
};

// Persisted per tab so the /boardgames rows and the /boardgames/all grid share
// the same search + filters — "View all" carries your context across. Callers
// with an independent list (e.g. a collection status page) pass their own key.
const DEFAULT_KEY = "library-filters-v1";

/** Convex args for games.libraryGames / games.libraryCount (empties omitted). */
export function toLibraryArgs(term: string, f: LibraryFilterState) {
  return {
    term: term.trim() || undefined,
    players: f.players ?? undefined,
    time: f.time ?? undefined,
    hasExpansions: f.hasExpansions || undefined,
    chatOnly: f.chatOnly || undefined,
    categories: f.categories.length ? f.categories : undefined,
    mechanics: f.mechanics.length ? f.mechanics : undefined,
  };
}

export function countActiveFilters(f: LibraryFilterState): number {
  return (
    (f.players ? 1 : 0) +
    (f.time ? 1 : 0) +
    (f.hasExpansions ? 1 : 0) +
    (f.chatOnly ? 1 : 0) +
    f.categories.length +
    f.mechanics.length
  );
}

/**
 * Shared search-term + filter state for a game list, persisted to sessionStorage
 * so navigating away and back (or "View all") keeps your context — which also
 * lets scroll restoration reconstruct the exact same list. Pass a `storageKey`
 * for an independent list (e.g. one collection status) and a `defaultSort` to
 * override the library default. Exposes a debounced Convex-args object.
 */
export function useLibraryFilters(
  storageKey: string = DEFAULT_KEY,
  defaultSort: GameSortKey = DEFAULT_SORT,
) {
  const KEY = storageKey;
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filters, setFilters] = useState<LibraryFilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<GameSortKey>(defaultSort);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once from the persisted snapshot. Deferred a frame so we don't call
  // setState synchronously in the effect body (avoids cascading renders and a
  // hydration mismatch — server + first client render both start empty).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const raw = sessionStorage.getItem(KEY);
        if (raw) {
          const s = JSON.parse(raw) as {
            term?: string;
            filters?: Partial<LibraryFilterState>;
            sort?: string;
          };
          if (s.filters) setFilters({ ...EMPTY_FILTERS, ...s.filters });
          if (s.sort && isGameSort(s.sort)) setSort(s.sort);
          if (typeof s.term === "string") {
            setTerm(s.term);
            setDebounced(s.term.trim());
          }
        }
      } catch {
        /* ignore malformed state */
      }
      setHydrated(true);
    });
    return () => cancelAnimationFrame(id);
  }, [KEY]);

  // Debounce the search term feeding the query.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 400);
    return () => clearTimeout(t);
  }, [term]);

  // Persist term + filters + sort after hydration.
  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ term, filters, sort }));
    } catch {
      /* storage unavailable */
    }
  }, [KEY, term, filters, sort, hydrated]);

  const args = useMemo(() => toLibraryArgs(debounced, filters), [debounced, filters]);
  const activeCount = countActiveFilters(filters);
  const searching = debounced.length >= 2;

  return {
    term,
    setTerm,
    debounced,
    searching,
    filters,
    setFilters,
    sort,
    setSort,
    clear: () => setFilters(EMPTY_FILTERS),
    args,
    activeCount,
    hydrated,
  };
}
