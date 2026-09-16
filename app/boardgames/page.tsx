"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { usePaginatedQuery, useQuery } from "convex/react";
import { SlidersHorizontal, ArrowRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useTopBarTitle } from "@/components/topbar/MobileTopBar";
import { GameCard } from "@/components/boardgames/GameCard";
import { CardRail } from "@/components/boardgames/CardRail";
import { FilterDrawer } from "@/components/boardgames/FilterDrawer";
import { useLibraryFilters } from "@/components/boardgames/useLibraryFilters";
import { SortControl } from "@/components/boardgames/SortControl";
import { ChatReadyToggle } from "@/components/boardgames/ChatReadyToggle";
import { CollectionSection } from "@/components/collection/CollectionSection";
import { useScrollRestore } from "@/components/lib/useScrollRestore";

const cellClass = "w-40 shrink-0 snap-start sm:w-44";

function LibraryInner() {
  // The nav search deep-links here as /boardgames?q=… — the term seeds the
  // results row; "View all" carries it into the full grid.
  const q = useSearchParams().get("q") ?? undefined;
  const { searching, filters, setFilters, sort, setSort, clear, args, activeCount } =
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
        </div>
      </div>

      {activeCount > 0 && (
        <button
          onClick={clear}
          className="mb-4 text-sm font-semibold text-accent hover:underline"
        >
          Clear all filters
        </button>
      )}

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
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`${cellClass} aspect-4/3 animate-pulse rounded-2xl bg-surface-2`}
              />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
            <p className="font-medium">No games match.</p>
            {activeCount > 0 && (
              <button
                onClick={clear}
                className="mt-1 text-sm text-accent hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <CardRail>
            {results.slice(0, 20).map((game, i) => (
              <li key={game._id} className={cellClass}>
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
