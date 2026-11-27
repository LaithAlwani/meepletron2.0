"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";

type GameDetail = FunctionReturnType<typeof api.games.getByHandle>;

/**
 * The game page's data. Visitors get it once from the cached `/api/games/[slug]`
 * route (no live subscription: the site doesn't need live updates and every
 * re-send of the full detail costs Convex bandwidth). Admins (`live`) keep the
 * live query so their own edits and rulebook-processing status show at once.
 * If the cached route fails, it falls back to the live query so the page still loads.
 *
 * Same contract as `useQuery`: `undefined` while loading, `null` when not found.
 */
export function useGameDetail(handle: string, live: boolean): GameDetail | undefined {
  const [fetched, setFetched] = useState<{ handle: string; game: GameDetail } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (live) return;
    let cancelled = false;
    fetch(`/api/games/${encodeURIComponent(handle)}`)
      .then(async (r) => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as GameDetail;
      })
      .then((game) => !cancelled && setFetched({ handle, game }))
      .catch(() => !cancelled && setFailed(handle));
    return () => {
      cancelled = true;
    };
  }, [handle, live]);

  const useLive = live || failed === handle;
  const liveGame = useQuery(api.games.getByHandle, useLive ? { handle } : "skip");
  if (useLive) return liveGame;
  return fetched?.handle === handle ? fetched.game : undefined;
}
