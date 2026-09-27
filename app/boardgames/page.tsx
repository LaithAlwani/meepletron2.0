"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTopBarTitle } from "@/components/topbar/MobileTopBar";
import { GameCard } from "@/components/boardgames/GameCard";
import { PreviewCard } from "@/components/boardgames/PreviewCard";
import { useBggSearch } from "@/components/boardgames/useBggSearch";
import { FilterDrawer } from "@/components/boardgames/FilterDrawer";
import { useLibraryFilters } from "@/components/boardgames/useLibraryFilters";
import { LibraryControls } from "@/components/boardgames/LibraryControls";
import { ActiveFilterBar } from "@/components/boardgames/ActiveFilterBar";
import { CARD_GRID, GameGridSkeleton } from "@/components/boardgames/GameGrid";
import { useScrollRestore } from "@/components/lib/useScrollRestore";
import { useInfiniteScroll } from "@/components/lib/useInfiniteScroll";

function LibraryInner() {
  // The nav search deep-links here as /boardgames?q=…
  const q = useSearchParams().get("q") ?? undefined;
  const { term, searching, filters, setFilters, sort, setSort, clear, args, activeCount } =
    useLibraryFilters(undefined, undefined, q);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Restore scroll + how-many-loaded when returning from a game's detail page.
  const { initialNumItems, restoreIfReady, save } = useScrollRestore(
    "library-home",
    24,
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.games.libraryGames,
    { ...args, sort },
    { initialNumItems },
  );
  useEffect(() => {
    restoreIfReady(results.length);
  }, [results.length, restoreIfReady]);

  // Skip the exact count while searching — it's a full-catalogue scan; show the
  // running result count instead.
  const total = useQuery(api.games.libraryCount, searching ? "skip" : args);

  const logSearch = useMutation(api.search.logSearch);
  useEffect(() => {
    if (searching) void logSearch({ term });
  }, [term, searching, logSearch]);

  // Wider "not in our library yet" search from BoardGameGeek (deduped). Skipped
  // when the chat-ready filter is on: BGG hits have no rulebook, so they can
  // never be chat-ready and shouldn't slip past that filter.
  const catalogBggIds = new Set(
    results.map((g) => g.bggId).filter((x): x is string => !!x),
  );
  const { results: bggResults, pending: bggPending } = useBggSearch(
    searching && !filters.chatOnly ? term : "",
    catalogBggIds,
  );

  const sentinelRef = useInfiniteScroll(() => loadMore(24), {
    canLoadMore: status === "CanLoadMore",
  });

  const loadingFirst = status === "LoadingFirstPage";
  useTopBarTitle("Library");

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-3 nav:pt-8">
      {/* Header — title on its own line; sort + filter on the next, right-aligned
          on desktop. (Search lives in the top nav.) */}
      <div className="mb-4 sm:mb-5">
        <div>
          <p className="mb-1 hidden text-[11px] font-bold uppercase tracking-[0.18em] text-accent nav:block">
            The library
          </p>
          <h1 className="font-display hidden nav:block text-2xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Board games
            {searching ? (
              results.length > 0 && (
                <span className="ml-2.5 align-middle text-base font-bold text-subtle">
                  {results.length}
                  {status === "CanLoadMore" || status === "LoadingMore" ? "+" : ""}
                </span>
              )
            ) : total !== undefined ? (
              <span className="ml-2.5 align-middle text-base font-bold text-subtle">
                {total}
              </span>
            ) : null}
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

      {loadingFirst ? (
        <GameGridSkeleton count={12} />
      ) : results.length === 0 && bggResults.length === 0 ? (
        bggPending ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="text-sm text-muted">Searching…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-20 text-center">
            <p className="font-semibold">
              {searching
                ? `No results for “${term}”`
                : "No games match these filters"}
            </p>
            {activeCount > 0 && (
              <button
                onClick={clear}
                className="text-sm text-accent hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )
      ) : (
        <>
          <div
            className={CARD_GRID}
            onClickCapture={(e) => {
              // Remember scroll before navigating to a card's detail page.
              if ((e.target as HTMLElement).closest("a")) save(results.length);
            }}
          >
            {results.map((g, i) => (
              <GameCard key={g._id} game={g} index={i} />
            ))}
            {bggResults.map((h, i) => (
              <PreviewCard key={h.bggId} hit={h} index={results.length + i} />
            ))}
          </div>

          <div ref={sentinelRef} aria-hidden className="h-px" />
          {status === "LoadingMore" && (
            <p className="mt-8 text-center text-sm text-muted">Loading…</p>
          )}
        </>
      )}

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
