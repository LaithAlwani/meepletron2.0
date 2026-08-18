"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import {
  Search,
  SlidersHorizontal,
  List,
  LayoutGrid,
  ChevronLeft,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { GameCard } from "@/components/boardgames/GameCard";
import { GameListItem } from "@/components/boardgames/GameListItem";
import { PreviewCard, PreviewRow } from "@/components/boardgames/PreviewCard";
import { useBggSearch } from "@/components/boardgames/useBggSearch";
import { FilterDrawer } from "@/components/boardgames/FilterDrawer";
import { useLibraryFilters } from "@/components/boardgames/useLibraryFilters";

type View = "grid" | "list";
const gridClass = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";

export default function AllBoardgamesPage() {
  const { term, setTerm, debounced, searching, filters, setFilters, clear, args, activeCount } =
    useLibraryFilters();
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

  const { results, status, loadMore } = usePaginatedQuery(
    api.games.libraryGames,
    args,
    { initialNumItems: 24 },
  );
  // Skip the exact count while searching — it's a full-catalogue scan; show the
  // running result count instead.
  const total = useQuery(api.games.libraryCount, searching ? "skip" : args);

  const logSearch = useMutation(api.search.logSearch);
  useEffect(() => {
    if (searching) void logSearch({ term: debounced });
  }, [debounced, searching, logSearch]);

  // Wider "not in our library yet" search from BoardGameGeek (deduped).
  const catalogBggIds = new Set(
    results.map((g) => g.bggId).filter((x): x is string => !!x),
  );
  const { results: bggResults, pending: bggPending } = useBggSearch(
    searching ? debounced : "",
    catalogBggIds,
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || status !== "CanLoadMore") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore(24);
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [status, loadMore]);

  const loadingFirst = status === "LoadingFirstPage";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/boardgames"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Library
      </Link>

      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search title, designer…"
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

      {activeCount > 0 && (
        <button
          onClick={clear}
          className="mb-4 text-sm font-semibold text-accent hover:underline"
        >
          Clear all filters
        </button>
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
              {searching ? `No results for “${debounced}”` : "No games match these filters"}
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
          {view === "list" ? (
            <div className="divide-y divide-border">
              {results.map((g) => (
                <GameListItem key={g._id} game={g} />
              ))}
              {bggResults.map((h) => (
                <PreviewRow key={h.bggId} hit={h} />
              ))}
            </div>
          ) : (
            <div className={gridClass}>
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
