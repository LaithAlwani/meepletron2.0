"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { GameCard } from "./GameCard";

/** "You might also like" — games sharing mechanics/categories. Hidden when none. */
export function SimilarGames({ gameId }: { gameId: Id<"games"> }) {
  const games = useQuery(api.games.similarGames, { gameId, limit: 8 });
  if (!games || games.length === 0) return null;

  return (
    <section className="animate-in mb-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        You might also like
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {games.map((g, i) => (
          <GameCard key={g._id} game={g} index={i} />
        ))}
      </div>
    </section>
  );
}
