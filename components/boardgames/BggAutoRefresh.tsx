"use client";

import { useEffect, useRef } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Renders nothing. On the game detail page, kicks off a lazy BGG stats refresh
 * only when the cache is stale (or missing) — so BGG is hit at most weekly per
 * viewed game, and never for games nobody looks at. The server action re-checks
 * the TTL, so this client gate is just to avoid a needless no-op call.
 */
export function BggAutoRefresh({
  gameId,
  bggId,
  fetchedAt,
}: {
  gameId: Id<"games">;
  bggId?: string;
  fetchedAt?: number;
}) {
  const refresh = useAction(api.bgg.refreshOne);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !bggId) return;
    if (fetchedAt && Date.now() - fetchedAt < TTL_MS) return;
    fired.current = true;
    void refresh({ gameId }).catch(() => {});
  }, [gameId, bggId, fetchedAt, refresh]);

  return null;
}
