"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPlayTime } from "@/lib/format";
import { bggImportHref, useBggSearch } from "./useBggSearch";

/** One row in the nav search dropdown — a library game or a BGG import. */
export type Suggestion = {
  key: string;
  source: "library" | "bgg";
  title: string;
  /** "2–4 players · 60–90 min · 2016" */
  detail: string;
  thumbUrl: string | null;
  rating: number | null;
  href: string;
};

/** How many rows the dropdown shows at most. */
export const MAX_SUGGESTIONS = 10;

/**
 * Places held for BoardGameGeek even when the catalogue filled the list. The
 * search index is fuzzy, so a game we *don't* have would otherwise be buried
 * under loose local matches — which is the whole reason to reach out to BGG.
 */
const BGG_SLOTS = 4;

function detailLine(g: {
  minPlayers: number | null;
  maxPlayers: number | null;
  minPlayTime: number | null;
  maxPlayTime: number | null;
  year: string | null;
}): string {
  const players =
    g.minPlayers && g.maxPlayers
      ? g.minPlayers === g.maxPlayers
        ? `${g.minPlayers} players`
        : `${g.minPlayers}–${g.maxPlayers} players`
      : null;
  return [
    players,
    formatPlayTime(g.minPlayTime ?? undefined, g.maxPlayTime ?? undefined),
    g.year,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Hold a value back until it stops changing for `ms` — one query per pause. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * The type-ahead behind the nav search: library matches first, then games we
 * don't have yet from BoardGameGeek (deduped against the local rows), capped at
 * `max`. Picking a library row opens the game; picking a BGG row runs the
 * import. Submitting instead goes to the full results page.
 *
 * `loading` is true while the first suggestions for the current term are still
 * coming, so the caller can hold off on an empty state.
 */
export function useSearchSuggestions(term: string, max = MAX_SUGGESTIONS) {
  const trimmed = term.trim();
  const searching = trimmed.length >= 2;
  // The Convex query is reactive and re-subscribes on every change, so let the
  // typing settle first. BGG has its own (longer) debounce inside the hook.
  const debounced = useDebounced(trimmed, 180);
  const settled = debounced === trimmed;

  const rows = useQuery(
    api.games.suggest,
    searching && settled ? { term: debounced, limit: max } : "skip",
  );
  const library = searching && settled ? (rows ?? []) : [];

  const have = new Set(
    library.map((g) => g.bggId).filter((x): x is string => !!x),
  );
  const { results: bggHits, pending: bggPending } = useBggSearch(
    searching ? trimmed : "",
    have,
  );

  // Library first, minus the places held for BGG; whatever either side doesn't
  // use goes back to the other.
  const bggCount = Math.min(bggHits.length, BGG_SLOTS);
  const libCount = Math.min(library.length, max - bggCount);

  const items: Suggestion[] = [
    ...library.slice(0, libCount).map((g) => ({
      key: `library:${g._id}`,
      source: "library" as const,
      title: g.title,
      detail: detailLine(g),
      thumbUrl: g.thumbUrl,
      rating: g.rating,
      href: `/boardgames/${g.slug}`,
    })),
    ...bggHits.slice(0, max - libCount).map((h) => ({
      key: `bgg:${h.bggId}`,
      source: "bgg" as const,
      title: h.name,
      detail: detailLine({ ...h, year: h.year }),
      thumbUrl: h.thumbUrl,
      rating: h.rating,
      href: bggImportHref(h),
    })),
  ];

  const libraryLoading = searching && (!settled || rows === undefined);
  return {
    items,
    searching,
    /** Nothing to show yet — a result for this term may still be on its way. */
    loading: searching && items.length === 0 && (libraryLoading || bggPending),
  };
}
