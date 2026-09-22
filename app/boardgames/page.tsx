"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { usePaginatedQuery, useQuery } from "convex/react";
import { ArrowRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useTopBarTitle } from "@/components/topbar/MobileTopBar";
import { GameCard } from "@/components/boardgames/GameCard";
import { CardRail } from "@/components/boardgames/CardRail";
import { FilterDrawer } from "@/components/boardgames/FilterDrawer";
import { useLibraryFilters } from "@/components/boardgames/useLibraryFilters";
import { LibraryControls } from "@/components/boardgames/LibraryControls";
import { ActiveFilterBar } from "@/components/boardgames/ActiveFilterBar";
import { RAIL_CELL, RailSkeletonCells } from "@/components/boardgames/GameGrid";
import { CollectionSection } from "@/components/collection/CollectionSection";
import { EmptyState } from "@/components/ui/EmptyState";
import { useScrollRestore } from "@/components/lib/useScrollRestore";

function LibraryInner() {
  // The nav search deep-links here as /boardgames?q=… — the term seeds the
  // results row; "View all" carries it into the full grid.
  const q = useSearchParams().get("q") ?? undefined;
  const { term, searching, filters, setFilters, sort, setSort, clear, args, activeCount } =
    useLibraryFilters(undefined, undefined, q);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Restore page scroll when returning from a game's detail page.
  const { initialNumItems, restoreIfReady, save } = useScrollRestore(
    "library-home",
    20,
  );
  const { results, status } = usePaginatedQuery(
    api.games.libraryGames,
    { ...args, sort },
    { initialNumItems },
  );
  useEffect(() => {
    restoreIfReady(results.length);
  }, [results.length, restoreIfReady]);
  // Count of everything matching the current query/filters — sits beside the
  // row heading and tells you whether "View all" is worth a tap.
  const total = useQuery(api.games.libraryCount, args);
  useTopBarTitle("Library");

  const loadingFirst = status === "LoadingFirstPage";
  const allHref = q
    ? `/boardgames/all?q=${encodeURIComponent(q)}`
    : "/boardgames/all";

  return (
    <div
      className="mx-auto max-w-3xl px-4 pb-8 pt-3 nav:pt-8"
      onClickCapture={(e) => {
        // Remember scroll before navigating to any card's detail page.
        if ((e.target as HTMLElement).closest("a")) save(results.length);
      }}
    >
      {/* Header — title on its own line; sort + filter on the next, right-aligned
          on desktop. (Search lives in the top nav.) */}
      <div className="mb-4 sm:mb-5">
        <div>
          <p className="mb-1 hidden text-[11px] font-bold uppercase tracking-[0.18em] text-accent nav:block">
            The library
          </p>
          <h1 className="font-display hidden nav:block text-2xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Board games
          </h1>
        </div>

        <LibraryControls
          filters={filters}
          setFilters={setFilters}
          sort={sort}
          setSort={setSort}
          activeCount={activeCount}
          onOpenFilters={() => setDrawerOpen(true)}
        />
      </div>

      <ActiveFilterBar term={term} activeCount={activeCount} onClear={clear} />

      {/* Board games rail — the search results (or a browse sample) */}
      <section className="mb-7 nav:mb-10">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-lg font-bold tracking-tight">
            {searching || activeCount > 0 ? "Results" : "Browse"}
            {total !== undefined && (
              <span className="ml-2 align-middle text-base font-bold text-subtle">
                {total}
              </span>
            )}
          </h2>
          <Link
            href={allHref}
            className="inline-flex items-center gap-1 pb-1 text-sm font-semibold text-accent hover:underline"
          >
            View all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loadingFirst ? (
          <RailSkeletonCells count={6} />
        ) : results.length === 0 ? (
          // Local catalogue only — games we don't have yet come from BoardGameGeek,
          // which the full results page shows.
          <EmptyState
            title="No games match."
            action={
              searching || activeCount > 0 ? (
                <>
                  {searching && (
                    <Link
                      href={allHref}
                      className="inline-block text-sm text-accent hover:underline"
                    >
                      Search BoardGameGeek for “{term}”
                    </Link>
                  )}
                  {activeCount > 0 && (
                    <button
                      onClick={clear}
                      className="block w-full text-sm text-accent hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </>
              ) : undefined
            }
          />
        ) : (
          <CardRail>
            {results.slice(0, 20).map((game, i) => (
              <li key={game._id} className={RAIL_CELL}>
                <GameCard game={game} index={i} />
              </li>
            ))}
          </CardRail>
        )}
      </section>

      {/* Your collection — hidden while searching, to keep the focus on results. */}
      {!searching && <CollectionSection />}

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        setFilters={setFilters}
        activeCount={activeCount}
        onClear={clear}
      />
    </div>
  );
}

export default function BoardgamesPage() {
  // useSearchParams() must sit under a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <LibraryInner />
    </Suspense>
  );
}
