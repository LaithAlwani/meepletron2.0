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
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-subtle">
        You might also like
      </h2>
      <div className="hscroll -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-3">
        {games.map((g, i) => (
          <div key={g._id} className="w-40 shrink-0 snap-start sm:w-44">
            <GameCard game={g} index={i} />
          </div>
        ))}
      </div>
    </section>
  );
}
