"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPlayTime } from "@/lib/format";

export type BggHit = {
  bggId: string;
  name: string;
  year: string | null;
  thumbUrl: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  minPlayTime: number | null;
  maxPlayTime: number | null;
  rating: number | null;
};

/** "2–4 players · 60–90 min · 2016" from a BGG hit's details. */
export function bggDetail(h: BggHit): string {
  const players =
    h.minPlayers && h.maxPlayers
      ? h.minPlayers === h.maxPlayers
        ? `${h.minPlayers} players`
        : `${h.minPlayers}–${h.maxPlayers} players`
      : null;
  return [
    players,
    formatPlayTime(h.minPlayTime ?? undefined, h.maxPlayTime ?? undefined),
    h.year,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Debounced "not in our library yet" search against BoardGameGeek. Returns hits
 * for the current term only (stale terms yield []), optionally excluding bgg ids
 * already shown from the local catalogue. `pending` is true while a search for
 * the current term is still in flight, so callers can hold off on an empty state.
 */
export function useBggSearch(
  term: string,
  exclude?: Set<string>,
): { results: BggHit[]; pending: boolean } {
  const trimmed = term.trim();
  const searching = trimmed.length >= 2;
  const bggSearch = useAction(api.bgg.search);
  const [raw, setRaw] = useState<{ term: string; hits: BggHit[] }>({
    term: "",
    hits: [],
  });

  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const hits = await bggSearch({ term: trimmed });
        if (!cancelled) setRaw({ term: trimmed, hits });
      } catch {
        if (!cancelled) setRaw({ term: trimmed, hits: [] });
      }
    }, 650);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [trimmed, searching, bggSearch]);

  const settled = raw.term === trimmed;
  const results = !settled
    ? []
    : exclude
      ? raw.hits.filter((h) => !exclude.has(h.bggId))
      : raw.hits;
  return { results, pending: searching && !settled };
}
