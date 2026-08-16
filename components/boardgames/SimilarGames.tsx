"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { GameCard } from "./GameCard";

/** "You might also like" — games sharing mechanics/categories. Hidden when none. */
export function SimilarGames({ gameId }: { gameId: Id<"games"> }) {
  const games = useQuery(api.games.similarGames, { gameId, limit: 8 });
  const scroller = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      el.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [sync, games]);

  if (!games || games.length === 0) return null;

  const nudge = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const arrowCls =
    "absolute top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface/95 text-muted shadow-md backdrop-blur transition-colors hover:text-accent lg:flex";

  return (
    <section className="animate-in mb-8">
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-subtle">
        You might also like
      </h2>
      <div className="relative">
        {!atStart && (
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label="Scroll left"
            className={`${arrowCls} -left-3`}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {!atEnd && (
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label="Scroll right"
            className={`${arrowCls} -right-3`}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        <div
          ref={scroller}
          className="no-scrollbar -mx-4 flex snap-x scroll-px-4 items-stretch gap-3 overflow-x-auto px-4 lg:mx-0 lg:px-0"
        >
          {games.map((g, i) => (
            <div key={g._id} className="w-40 shrink-0 snap-start sm:w-44">
              <GameCard game={g} index={i} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
