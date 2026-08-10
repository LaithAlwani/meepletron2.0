"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { Heart } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";

/**
 * Favourite toggle used everywhere (cards, rows, detail hero). Always stops the
 * surrounding link/click; `className` replaces the button styling and `size`
 * picks the icon scale.
 */
export function FavoriteToggle({
  gameId,
  className,
  size = "md",
}: {
  gameId: Id<"games">;
  className?: string;
  size?: "sm" | "md";
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
      title={isFav ? "Remove from favourites" : "Add to favourites"}
      className={
        className ??
        "flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:text-accent"
      }
    >
      <Heart
        className={`${size === "sm" ? "h-4 w-4" : "h-5 w-5"} ${
          isFav ? "fill-accent text-accent" : ""
        }`}
      />
    </button>
  );
}
