"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type CollectionFlags = {
  owned: boolean;
  wishlist: boolean;
  forTrade: boolean;
  prevOwned: boolean;
};

const ZERO: CollectionFlags = {
  owned: false,
  wishlist: false,
  forTrade: false,
  prevOwned: false,
};

/** Matches STATES_MAX in convex/collection.ts. */
const MAX_IDS = 200;

type Shared = {
  ids: Set<string>;
  states: Map<string, CollectionFlags> | undefined;
};

const Ctx = createContext<Shared | null>(null);

/**
 * Fetch the signed-in user's collection flags for a whole list of cards in one
 * subscription. CollectionButton reads from here when its game is covered, and
 * falls back to its own per-game query otherwise (no provider, or past the cap).
 */
export function CollectionStateProvider({
  gameIds,
  children,
}: {
  gameIds: Id<"games">[];
  children: ReactNode;
}) {
  const { isAuthenticated } = useConvexAuth();
  const key = gameIds.slice(0, MAX_IDS).join(",");
  const ids = useMemo(
    () => (key ? (key.split(",") as Id<"games">[]) : []),
    [key],
  );
  const rows = useQuery(
    api.collection.states,
    isAuthenticated && ids.length > 0 ? { gameIds: ids } : "skip",
  );
  const value = useMemo<Shared>(
    () => ({
      ids: new Set(ids),
      states: rows
        ? new Map(rows.map(({ gameId, ...flags }) => [gameId, flags]))
        : undefined,
    }),
    [ids, rows],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The shared flags for `gameId`: `covered` is false when no provider lists this
 * game (caller should query it itself); `state` is undefined while loading.
 */
export function useSharedCollectionState(gameId: Id<"games">): {
  covered: boolean;
  state: CollectionFlags | undefined;
} {
  const shared = useContext(Ctx);
  if (!shared || !shared.ids.has(gameId)) return { covered: false, state: undefined };
  return {
    covered: true,
    state: shared.states ? (shared.states.get(gameId) ?? ZERO) : undefined,
  };
}
