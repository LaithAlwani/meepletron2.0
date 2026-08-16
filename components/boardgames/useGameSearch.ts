"use client";

import { useEffect, useState } from "react";
import { usePaginatedQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useBggSearch } from "./useBggSearch";

/**
 * Shared game browsing: paginated library + fuzzy search (title, designers,
 * publishers, categories, mechanics), plus a debounced "not in our library yet"
 * search against BoardGameGeek (deduped against what we already have). Used by
 * the library page and the game pickers.
 */
export function useGameSearch(pageSize = 24) {
  const [term, setTerm] = useState("");
  const trimmed = term.trim();
  const searching = trimmed.length >= 2;

  const list = usePaginatedQuery(
    api.games.listPaginated,
    searching ? "skip" : {},
    { initialNumItems: pageSize },
  );
  const search = usePaginatedQuery(
    api.games.searchPaginated,
    searching ? { term: trimmed } : "skip",
    { initialNumItems: pageSize },
  );

  const logSearch = useMutation(api.search.logSearch);
  useEffect(() => {
    if (!searching) return;
    const t = setTimeout(() => void logSearch({ term: trimmed }), 900);
    return () => clearTimeout(t);
  }, [trimmed, searching, logSearch]);

  const active = searching ? search : list;

  const have = new Set(
    active.results.map((g) => g.bggId).filter((x): x is string => !!x),
  );
  const bgg = useBggSearch(trimmed, have);

  return {
    term,
    setTerm,
    searching,
    results: active.results,
    status: active.status,
    loadMore: () => active.loadMore(pageSize),
    bggResults: bgg.results,
    bggPending: bgg.pending,
  };
}
