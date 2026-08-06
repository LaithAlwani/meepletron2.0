"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";

export function FavoriteButton({
  gameId,
  className,
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

  async function onClick() {
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
      title={isFav ? "Remove from favourites" : "Add to favourites"}
      className={
        className ??
        "rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      }
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill={isFav ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-5 w-5 ${isFav ? "text-accent" : ""}`}
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
      </svg>
    </button>
  );
}
