"use client";

import { useEffect, useRef, useState } from "react";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Search, List, LayoutGrid } from "lucide-react";
import { GameCard } from "@/components/boardgames/GameCard";
import { GameListItem } from "@/components/boardgames/GameListItem";

type View = "grid" | "list";
type TimeFilter = "quick" | "standard" | "epic";
type Filters = { players: number | null; time: TimeFilter | null; hasExpansions: boolean };

const PLAYER_OPTIONS = [1, 2, 3, 4, 5, 6];
const TIME_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: "quick", label: "≤30 min" },
  { value: "standard", label: "30–90 min" },
  { value: "epic", label: "90+ min" },
];
const EMPTY_FILTERS: Filters = { players: null, time: null, hasExpansions: false };

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
        active
          ? "border-accent bg-accent text-accent-foreground shadow-sm"
          : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

const gridClass =
  "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";

export default function BoardgamesPage() {
  const [view, setView] = useState<View>("grid");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const searching = debounced.length >= 2;

  // Debounce the search so the query only fires 1s after typing stops.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 1000);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    if (localStorage.getItem("boardgames-view") === "list") setView("list");
  }, []);

  function toggleView() {
    setView((v) => {
      const next = v === "grid" ? "list" : "grid";
      localStorage.setItem("boardgames-view", next);
      return next;
    });
  }

  const browse = usePaginatedQuery(
    api.games.browsePaginated,
    searching
      ? "skip"
      : {
          players: filters.players ?? undefined,
          time: filters.time ?? undefined,
          hasExpansions: filters.hasExpansions || undefined,
        },
    { initialNumItems: 24 },
  );
  const search = usePaginatedQuery(
    api.games.searchPaginated,
    searching ? { term: debounced } : "skip",
    { initialNumItems: 24 },
  );

  const browseTotal = useQuery(
    api.games.browseCount,
    searching
      ? "skip"
      : {
          players: filters.players ?? undefined,
          time: filters.time ?? undefined,
          hasExpansions: filters.hasExpansions || undefined,
        },
  );

  const logSearch = useMutation(api.search.logSearch);
  useEffect(() => {
    // `debounced` is already delayed, so log the settled term directly.
    if (searching) void logSearch({ term: debounced });
  }, [debounced, searching, logSearch]);

  const active = searching ? search : browse;
  const loadingFirst = active.status === "LoadingFirstPage";
  const results = active.results;

  // Auto-load the next page when the sentinel scrolls into view (a bit before,
  // via rootMargin) so paging feels seamless — no button press.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const status = active.status;
  const loadMore = active.loadMore;
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
  const activeFilterCount =
    (filters.players ? 1 : 0) + (filters.time ? 1 : 0) + (filters.hasExpansions ? 1 : 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
            The library
          </p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Board games
            {(searching
              ? results.length > 0
              : browseTotal !== undefined) && (
              <span className="ml-2.5 align-middle text-base font-bold text-subtle">
                {searching
                  ? `${results.length}${
                      active.status === "CanLoadMore" ||
                      active.status === "LoadingMore"
                        ? "+"
                        : ""
                    }`
                  : browseTotal}
              </span>
            )}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-72">
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
            onClick={toggleView}
            aria-label={view === "grid" ? "Switch to list view" : "Switch to grid view"}
            title={view === "grid" ? "List view" : "Grid view"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            {view === "grid" ? (
              <List className="h-[18px] w-[18px]" />
            ) : (
              <LayoutGrid className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="-mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
        <span className="shrink-0 text-xs font-medium text-subtle">Players</span>
        {PLAYER_OPTIONS.map((p) => (
          <FilterChip
            key={p}
            active={filters.players === p}
            onClick={() =>
              setFilters((f) => ({ ...f, players: f.players === p ? null : p }))
            }
          >
            {p === 6 ? "6+" : p}
          </FilterChip>
        ))}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
        {TIME_OPTIONS.map(({ value, label }) => (
          <FilterChip
            key={value}
            active={filters.time === value}
            onClick={() =>
              setFilters((f) => ({ ...f, time: f.time === value ? null : value }))
            }
          >
            {label}
          </FilterChip>
        ))}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
        <FilterChip
          active={filters.hasExpansions}
          onClick={() =>
            setFilters((f) => ({ ...f, hasExpansions: !f.hasExpansions }))
          }
        >
          Has expansions
        </FilterChip>
        {activeFilterCount > 0 && (
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="ml-1 shrink-0 px-2 py-1 text-xs text-subtle transition-colors hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Content */}
      {loadingFirst ? (
        view === "list" ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-surface-2" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 animate-pulse rounded bg-surface-2" />
                  <div className="h-2.5 w-1/3 animate-pulse rounded bg-surface-2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={gridClass}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-4/3 animate-pulse rounded-2xl bg-surface-2" />
            ))}
          </div>
        )
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center">
          <p className="font-semibold">
            {searching
              ? `No results for “${debounced}”`
              : "No games match these filters"}
          </p>
          {searching ? (
            <p className="text-sm text-subtle">
              Want this game added?{" "}
              <a href="/#contact" className="text-accent underline">
                Request it
              </a>
            </p>
          ) : (
            activeFilterCount > 0 && (
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="text-sm text-accent hover:underline"
              >
                Clear filters
              </button>
            )
          )}
        </div>
      ) : (
        <>
          {view === "list" ? (
            <div className="divide-y divide-border">
              {results.map((g) => (
                <GameListItem key={g._id} game={g} />
              ))}
            </div>
          ) : (
            <div className={gridClass}>
              {results.map((g, i) => (
                <GameCard key={g._id} game={g} index={i} />
              ))}
            </div>
          )}

          {/* Invisible sentinel — scrolling near it auto-loads the next page. */}
          <div ref={sentinelRef} aria-hidden className="h-px" />
          {active.status === "LoadingMore" && (
            <p className="mt-8 text-center text-sm text-muted">Loading…</p>
          )}
        </>
      )}
    </div>
  );
}
