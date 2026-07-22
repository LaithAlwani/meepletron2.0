"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TuckboxDesigner } from "@/components/tuckbox/TuckboxDesigner";

function TuckboxInner() {
  const searchParams = useSearchParams();
  const gameId = searchParams.get("gameId");
  const game = useQuery(
    api.games.getById,
    gameId ? { gameId: gameId as Id<"games"> } : "skip",
  );

  const cover = game ? (game.imageUrl ?? game.thumbnailUrl ?? undefined) : undefined;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Tuckbox generator</h1>
        <p className="mt-1 text-sm text-muted">
          Design a print-ready card box.
          {game
            ? ` Prefilled from ${game.title}${cover ? "" : " (no cover image — upload your own artwork below)"}.`
            : " Upload your own artwork below, or open it from a game to use its cover."}
        </p>
      </header>

      {/* Remount when the game changes so a fresh prefill resets the box artwork. */}
      <TuckboxDesigner
        key={gameId ?? "blank"}
        initialBoardgame={
          gameId && game
            ? { title: game.title, imageUrl: cover }
            : undefined
        }
      />
    </div>
  );
}

export default function TuckboxPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-8 text-muted">Loading…</div>
      }
    >
      <TuckboxInner />
    </Suspense>
  );
}
