"use client";

import { useState } from "react";
import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import { Search, SlidersHorizontal, ArrowRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { GameCard } from "@/components/boardgames/GameCard";
import { PreviewCard } from "@/components/boardgames/PreviewCard";
import { CardRail } from "@/components/boardgames/CardRail";
import { useBggSearch } from "@/components/boardgames/useBggSearch";
import { FilterDrawer } from "@/components/boardgames/FilterDrawer";
import { useLibraryFilters } from "@/components/boardgames/useLibraryFilters";
import { CollectionSection } from "@/components/collection/CollectionSection";

const cellClass = "w-40 shrink-0 snap-start sm:w-44";

export default function BoardgamesPage() {
  const { term, setTerm, debounced, searching, filters, setFilters, clear, args, activeCount } =
    useLibraryFilters();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { results, status } = usePaginatedQuery(api.games.libraryGames, args, {
    initialNumItems: 20,
  });
  // Skip the exact count while searching — it's a full-catalogue scan, and the
  // search path already shows a live result count.
  const total = useQuery(api.games.libraryCount, searching ? "skip" : args);

  const loadingFirst = status === "LoadingFirstPage";

  // When the local library turns up thin (< 10 matches), reach out to
  // BoardGameGeek for more — same "not in our library yet" cards as /all.
  const thin = !loadingFirst && results.length < 10;
  const catalogBggIds = new Set(
    results.map((g) => g.bggId).filter((x): x is string => !!x),
  );
  const { results: bggResults, pending: bggPending } = useBggSearch(
    searching && thin ? debounced : "",
    catalogBggIds,
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header — the title sits on the left; a compact search + filter share the
          line on desktop, dropping into a full-width row below on mobile. */}
      <div className="mb-4 sm:mb-5 sm:flex sm:items-end sm:justify-between sm:gap-4">
        <div>
          <p className="mb-1 hidden text-[11px] font-bold uppercase tracking-[0.18em] text-accent sm:block">
            The library
          </p>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Board games
            {total !== undefined && (
              <span className="ml-2.5 align-middle text-base font-bold text-subtle">
                {total}
              </span>
            )}
          </h1>
        </div>

        <div className="mt-4 flex items-center gap-2 sm:mt-0 sm:shrink-0">
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search title, designer, publisher…"
              className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3 text-sm outline-none transition-shadow focus:border-accent/50 focus:ring-2 focus:ring-ring/40"
            />
          </div>
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

      {/* Board games rail */}
      <section className="mb-10">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-lg font-bold tracking-tight">
            {activeCount > 0 || term ? "Matches" : "Browse"}
          </h2>
          <Link
            href="/boardgames/all"
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
        ) : results.length === 0 && bggResults.length === 0 ? (
          bggPending ? (
            <div className="flex items-center gap-3 py-10 text-center text-muted">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="text-sm">Searching BoardGameGeek…</p>
            </div>
          ) : (
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
          )
        ) : (
          <CardRail>
            {results.slice(0, 20).map((game, i) => (
              <li key={game._id} className={cellClass}>
                <GameCard game={game} index={i} />
              </li>
            ))}
            {thin &&
              bggResults.map((hit, i) => (
                <li key={hit.bggId} className={cellClass}>
                  <PreviewCard hit={hit} index={results.length + i} />
                </li>
              ))}
          </CardRail>
        )}
      </section>

      {/* Your collection */}
      <CollectionSection />

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
