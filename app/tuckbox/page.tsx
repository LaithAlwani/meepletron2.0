"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TuckboxDesigner } from "@/components/tuckbox/TuckboxDesigner";
import { TuckboxGuide } from "@/components/tuckbox/TuckboxGuide";

function TuckboxInner() {
  const searchParams = useSearchParams();
  const gameId = searchParams.get("gameId");
  const game = useQuery(
    api.games.getById,
    gameId ? { gameId: gameId as Id<"games"> } : "skip",
  );

  const cover = game ? (game.imageUrl ?? game.thumbnailUrl ?? undefined) : undefined;

  // Remount when the game changes so a fresh prefill resets the box artwork.
  return (
    <>
      <TuckboxDesigner
        key={gameId ?? "blank"}
        initialBoardgame={
          gameId && game ? { title: game.title, imageUrl: cover } : undefined
        }
      />
      <TuckboxGuide />
    </>
  );
}

export default function TuckboxPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-8 text-muted">Loading…</div>
      }
    >
      <TuckboxInner />
    </Suspense>
  );
}
