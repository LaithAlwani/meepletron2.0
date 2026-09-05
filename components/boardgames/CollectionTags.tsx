"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type StateKey = "owned" | "wishlist" | "forTrade" | "prevOwned";

const TAGS: { key: StateKey; label: string; cls: string }[] = [
  { key: "owned", label: "Owned", cls: "bg-accent text-accent-foreground" },
  { key: "wishlist", label: "Wishlist", cls: "bg-accent-2 text-white" },
  { key: "forTrade", label: "For Sale", cls: "bg-amber-500 text-white" },
  { key: "prevOwned", label: "Prev-owned", cls: "bg-slate-500 text-white" },
];

/**
 * Read-only tags showing which of the four collection lists a game is in. Purely
 * informational (not interactive) — editing happens through CollectionButton.
 * Renders nothing when the game isn't in any list. `size` = card badge vs inline.
 */
export function CollectionTags({
  gameId,
  size = "sm",
  className,
}: {
  gameId: Id<"games">;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { isAuthenticated } = useConvexAuth();
  const state = useQuery(
    api.collection.state,
    isAuthenticated ? { gameId } : "skip",
  );
  if (!state) return null;
  const active = TAGS.filter((t) => state[t.key]);
  if (active.length === 0) return null;

  const pill =
    size === "lg"
      ? "px-3.5 py-2 text-base"
      : size === "md"
        ? "px-2 py-0.5 text-xs"
        : "px-1.5 py-0.5 text-[10px]";

  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ""}`}>
      {active.map((t) => (
        <span
          key={t.key}
          className={`inline-flex items-center rounded-md font-bold shadow-sm ${pill} ${t.cls}`}
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}
