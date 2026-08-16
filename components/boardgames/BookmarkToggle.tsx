"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { Bookmark } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";

/**
 * The bookmark — marks a game as **owned** in your collection. Mirror of the
 * heart (wishlist); `className` replaces the button styling.
 */
export function BookmarkToggle({
  gameId,
  className,
  size = "md",
}: {
  gameId: Id<"games">;
  className?: string;
  size?: "sm" | "md";
}) {
  const { isAuthenticated } = useConvexAuth();
  const state = useQuery(
    api.collection.state,
    isAuthenticated ? { gameId } : "skip",
  );
  const owned = !!state?.owned;
  const toggle = useMutation(api.collection.toggleOwned);
  const toast = useToast();

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      toast("Sign in to build your collection", "info");
      return;
    }
    try {
      await toggle({ gameId });
    } catch {
      toast("Couldn't update your collection", "error");
    }
  }

  return (
    <button
      onClick={onClick}
      aria-label={owned ? "Remove from owned" : "Mark as owned"}
      title={owned ? "Owned — remove" : "Add to owned"}
      className={
        className ??
        "flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:text-accent"
      }
    >
      <Bookmark
        className={`${size === "sm" ? "h-4 w-4" : "h-5 w-5"} ${
          owned ? "fill-accent text-accent" : ""
        }`}
      />
    </button>
  );
}
