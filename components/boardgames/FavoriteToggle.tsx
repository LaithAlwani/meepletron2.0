"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { Heart } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";

/**
 * The heart — adds a game to your collection's **Want** list (the merged
 * wishlist / want / want-to-buy / preordered bucket). Used on cards, rows, and
 * the detail hero. Always stops the surrounding link/click; `className` replaces
 * the button styling and `size` picks the icon scale.
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
  const state = useQuery(
    api.collection.state,
    isAuthenticated ? { gameId } : "skip",
  );
  const wanted = !!state?.want;
  const toggle = useMutation(api.collection.toggleWishlist);
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
      toast("Couldn't update your want list", "error");
    }
  }

  return (
    <button
      onClick={onClick}
      aria-label={wanted ? "Remove from want list" : "Add to want list"}
      title={wanted ? "Remove from Want" : "Add to Want"}
      className={
        className ??
        "flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:text-accent"
      }
    >
      <Heart
        className={`${size === "sm" ? "h-4 w-4" : "h-5 w-5"} ${
          wanted ? "fill-accent text-accent" : ""
        }`}
      />
    </button>
  );
}
