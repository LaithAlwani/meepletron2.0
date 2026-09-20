"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { SlidersHorizontal, List, LayoutGrid } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { GameCard } from "@/components/boardgames/GameCard";
import { GameListItem } from "@/components/boardgames/GameListItem";
import { PreviewCard, PreviewRow } from "@/components/boardgames/PreviewCard";
import { useBggSearch } from "@/components/boardgames/useBggSearch";
import { FilterDrawer } from "@/components/boardgames/FilterDrawer";
import { useLibraryFilters } from "@/components/boardgames/useLibraryFilters";
import { SearchTermChip } from "@/components/boardgames/SearchTermChip";
import { SortControl } from "@/components/boardgames/SortControl";
import { ChatReadyToggle } from "@/components/boardgames/ChatReadyToggle";
import { BackButton } from "@/components/ui/BackButton";
import { useScrollRestore } from "@/components/lib/useScrollRestore";
import { useInfiniteScroll } from "@/components/lib/useInfiniteScroll";

type View = "grid" | "list";
const gridClass = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";

function AllBoardgamesInner() {
  // The nav search deep-links here as /boardgames/all?q=…
  const q = useSearchParams().get("q") ?? undefined;
  const { term, searching, filters, setFilters, sort, setSort, clear, args, activeCount } =
    useLibraryFilters(undefined, undefined, q);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState<View>("grid");

  useEffect(() => {
    // Deferred so we don't setState synchronously in the effect body.
    const id = requestAnimationFrame(() => {
      if (localStorage.getItem("boardgames-view") === "list") setView("list");
    });
    return () => cancelAnimationFrame(id);
  }, []);

  function toggleView() {
    setView((v) => {
      const next = v === "grid" ? "list" : "grid";
      localStorage.setItem("boardgames-view", next);
      return next;
    });
  }

  // Restore scroll + how-many-loaded when returning from a game's detail page.
  const { initialNumItems, restoreIfReady, save } = useScrollRestore(
    "library-all",
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

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-3 nav:pt-8">
      {/* Header — on desktop the back link and title share the first line; the
          search + filters sit on the next, right-aligned (matches /boardgames).
          Mobile gets all of it from the top bar instead. */}
      <div className="mb-4 sm:mb-5">
        <div className="hidden items-center gap-3 nav:flex">
          <BackButton fallbackHref="/boardgames" className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-foreground" />
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            All board games
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

        {/* Next line: sort + filters, right-aligned on desktop. Search lives in
            the top nav and deep-links here with ?q=. */}
        <div className="mt-2 flex items-center justify-end gap-2 nav:mt-4">
          <ChatReadyToggle
            active={filters.chatOnly}
            onToggle={() =>
              setFilters({ ...filters, chatOnly: !filters.chatOnly })
            }
          />
          <SortControl
            value={sort}
            onChange={setSort}
            className="flex-1 sm:w-40 sm:flex-none"
          />
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Filters"
            title="Filters"
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <SlidersHorizontal className="h-4.5 w-4.5" />
            {activeCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-foreground">
                {activeCount}
              </span>
            )}
          </button>
          <button
            onClick={toggleView}
            aria-label={view === "grid" ? "Switch to list view" : "Switch to grid view"}
            title={view === "grid" ? "List view" : "Grid view"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            {view === "grid" ? (
              <List className="h-4.5 w-4.5" />
            ) : (
              <LayoutGrid className="h-4.5 w-4.5" />
            )}
          </button>
        </div>
      </div>

      {/* What's narrowing the page, and how to undo it. The term only lives in
          the URL, so without the chip it filters invisibly. */}
      {(term || activeCount > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <SearchTermChip term={term} />
          {activeCount > 0 && (
            <button
              onClick={clear}
              className="text-sm font-semibold text-accent hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {loadingFirst ? (
        <div className={gridClass}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-4/3 animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </div>
      ) : results.length === 0 && bggResults.length === 0 ? (
        bggPending ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="text-sm text-muted">Searching…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-20 text-center">
            <p className="font-semibold">
              {searching ? `No results for “${term}”` : "No games match these filters"}
            </p>
            {activeCount > 0 && (
              <button onClick={clear} className="text-sm text-accent hover:underline">
                Clear filters
              </button>
            )}
          </div>
        )
      ) : (
        <>
          {/* Save scroll + loaded count when a card link is clicked, so Back from
              the game's detail lands where they were. */}
          {view === "list" ? (
            <div
              className="divide-y divide-border"
              onClickCapture={(e) => {
                if ((e.target as HTMLElement).closest("a")) save(results.length);
              }}
            >
              {results.map((g) => (
                <GameListItem key={g._id} game={g} />
              ))}
              {bggResults.map((h) => (
                <PreviewRow key={h.bggId} hit={h} />
              ))}
            </div>
          ) : (
            <div
              className={gridClass}
              onClickCapture={(e) => {
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
          )}

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

export default function AllBoardgamesPage() {
  // useSearchParams() must sit under a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <AllBoardgamesInner />
    </Suspense>
  );
}
