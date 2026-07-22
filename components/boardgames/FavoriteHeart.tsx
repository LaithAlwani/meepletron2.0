"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";

/** Compact favourite toggle for cards/rows. Stops the surrounding link. */
export function FavoriteHeart({
  gameId,
  className = "",
}: {
  gameId: Id<"games">;
  className?: string;
}) {
  const { isAuthenticated } = useConvexAuth();
  const isFav = useQuery(
    api.favorites.isFavorited,
    isAuthenticated ? { gameId } : "skip",
  );
  const toggle = useMutation(api.favorites.toggle);
  const toast = useToast();

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      toast("Sign in to save favourites", "info");
      return;
    }
    try {
      await toggle({ gameId });
    } catch {
      toast("Couldn't update favourites", "error");
    }
  }

  return (
    <button
      onClick={onClick}
      aria-label={isFav ? "Remove from favourites" : "Add to favourites"}
      className={`flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:text-accent ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill={isFav ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-4 w-4 ${isFav ? "text-accent" : ""}`}
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
      </svg>
    </button>
  );
}
