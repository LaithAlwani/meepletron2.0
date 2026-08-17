"use client";

import { useEffect, useRef, useState } from "react";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Search, List, LayoutGrid, Bot } from "lucide-react";
import { GameCard } from "@/components/boardgames/GameCard";
import { GameListItem } from "@/components/boardgames/GameListItem";
import { PreviewCard, PreviewRow } from "@/components/boardgames/PreviewCard";
import { useBggSearch } from "@/components/boardgames/useBggSearch";

type View = "grid" | "list";
type TimeFilter = "quick" | "standard" | "epic";
type Filters = {
  players: number | null;
  time: TimeFilter | null;
  hasExpansions: boolean;
  chatOnly: boolean;
};

const PLAYER_OPTIONS = [1, 2, 3, 4, 5, 6];
const TIME_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: "quick", label: "≤30 min" },
  { value: "standard", label: "30–90 min" },
  { value: "epic", label: "90+ min" },
];
const EMPTY_FILTERS: Filters = {
  players: null,
  time: null,
  hasExpansions: false,
  chatOnly: false,
};

// Persisted per browser tab so returning from a detail page lands you back where
// you were — same filters/search, same number of pages loaded, same scroll.
const SCROLL_KEY = "boardgames-list-state";
// Note: the search term is deliberately NOT persisted — resuming a stale search
// on every return to the library was surprising. Only filters + scroll resume.
type SavedListState = {
  filters: Filters;
  count: number;
  scrollY: number;
};

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
  const chatOnly = filters.chatOnly;

  // When set (on return from a detail page), the list loads pages until it has
  // `count` items again, then scrolls back to `scrollY`.
  const [restoreTarget, setRestoreTarget] = useState<{
    scrollY: number;
    count: number;
  } | null>(null);
  const restoredRef = useRef(false);

  // Debounce the search so the query only fires 1s after typing stops.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 1000);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    if (localStorage.getItem("boardgames-view") === "list") setView("list");
  }, []);

  // On mount, replay the list state saved when we last left (e.g. to open a game
  // detail page): restore filters/search, then queue the scroll restore.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = sessionStorage.getItem(SCROLL_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as SavedListState;
      if (s.filters) setFilters(s.filters);
      if (s.count > 0 && s.scrollY > 0) {
        setRestoreTarget({ scrollY: s.scrollY, count: s.count });
      }
    } catch {
      /* ignore malformed state */
    }
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
    searching || chatOnly
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
    searching && !chatOnly ? { term: debounced } : "skip",
    { initialNumItems: 24 },
  );

  const browseTotal = useQuery(
    api.games.browseCount,
    searching || chatOnly
      ? "skip"
      : {
          players: filters.players ?? undefined,
          time: filters.time ?? undefined,
          hasExpansions: filters.hasExpansions || undefined,
        },
  );

  // Chat-ready view: a single (non-paginated) query returning the whole small
  // curated set of games Meepletron can chat about, filtered + searched.
  const chatGames = useQuery(
    api.games.chatEnabledGames,
    chatOnly
      ? {
          term: searching ? debounced : undefined,
          players: filters.players ?? undefined,
          time: filters.time ?? undefined,
          hasExpansions: filters.hasExpansions || undefined,
        }
      : "skip",
  );

  const logSearch = useMutation(api.search.logSearch);
  useEffect(() => {
    // `debounced` is already delayed, so log the settled term directly.
    if (searching) void logSearch({ term: debounced });
  }, [debounced, searching, logSearch]);

  const active = searching ? search : browse;
  const results = chatOnly ? (chatGames ?? []) : active.results;
  const loadingFirst = chatOnly
    ? chatGames === undefined
    : active.status === "LoadingFirstPage";

  // Wider search: games we don't have yet, from BoardGameGeek (deduped). The
  // chat-ready view is local-only — those games can't be chatted with — so we
  // don't offer BGG imports there.
  const catalogBggIds = new Set(
    results.map((g) => g.bggId).filter((x): x is string => !!x),
  );
  const { results: bggResults, pending: bggPending } = useBggSearch(
    chatOnly ? "" : debounced,
    catalogBggIds,
  );

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

  // Drive the scroll restore: keep loading pages until we're back to the saved
  // item count (the grid's fixed aspect ratios make its height deterministic, so
  // once the items render the page is tall enough), then jump to the saved Y.
  useEffect(() => {
    if (!restoreTarget) return;
    // Chat-ready view isn't paginated — just wait for its single query, then jump.
    if (chatOnly) {
      if (chatGames === undefined) return;
      requestAnimationFrame(() => window.scrollTo(0, restoreTarget.scrollY));
      setRestoreTarget(null);
      return;
    }
    if (results.length < restoreTarget.count && status === "CanLoadMore") {
      loadMore(24);
      return;
    }
    // Still fetching the pages we asked for — wait for the next render.
    if (status === "LoadingFirstPage" || status === "LoadingMore") return;
    const y = restoreTarget.scrollY;
    requestAnimationFrame(() => window.scrollTo(0, y));
    setRestoreTarget(null);
  }, [restoreTarget, results.length, status, loadMore, chatOnly, chatGames]);

  // Snapshot the list state whenever we navigate away (the component unmounts on
  // a client-side route change), so a later return can replay it.
  const saveRef = useRef<SavedListState>({
    filters,
    count: results.length,
    scrollY: 0,
  });
  saveRef.current = { filters, count: results.length, scrollY: 0 };
  useEffect(() => {
    return () => {
      // Don't clobber a good snapshot with an empty one (e.g. StrictMode's
      // dev-only mount/unmount cycle before the first page has loaded).
      if (saveRef.current.count === 0) return;
      try {
        sessionStorage.setItem(
          SCROLL_KEY,
          JSON.stringify({ ...saveRef.current, scrollY: window.scrollY }),
        );
      } catch {
        /* storage unavailable — nothing to restore, no harm */
      }
    };
  }, []);

  const activeFilterCount =
    (filters.players ? 1 : 0) +
    (filters.time ? 1 : 0) +
    (filters.hasExpansions ? 1 : 0) +
    (filters.chatOnly ? 1 : 0);

  // Count shown next to the title. Chat-ready + search are exact; browse uses
  // the server count and gets a "+" while more pages can still load.
  const canLoadMore =
    active.status === "CanLoadMore" || active.status === "LoadingMore";
  let countLabel: string | null = null;
  if (chatOnly) {
    if (chatGames !== undefined) countLabel = String(results.length);
  } else if (searching) {
    if (results.length > 0) countLabel = `${results.length}${canLoadMore ? "+" : ""}`;
  } else if (browseTotal !== undefined) {
    countLabel = String(browseTotal);
  }

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
            {countLabel !== null && (
              <span className="ml-2.5 align-middle text-base font-bold text-subtle">
                {countLabel}
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
        <FilterChip
          active={filters.chatOnly}
          onClick={() => setFilters((f) => ({ ...f, chatOnly: !f.chatOnly }))}
        >
          <span className="inline-flex items-center gap-1">
            <Bot className="h-3.5 w-3.5" />
            Chat-ready
          </span>
        </FilterChip>
        <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
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
      ) : results.length === 0 && bggResults.length === 0 ? (
        bggPending ? (
          // Still checking the wider database — don't flash "no results" yet.
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="text-sm text-muted">Searching…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-20 text-center">
            <p className="font-semibold">
              {searching
                ? `No results for “${debounced}”`
                : chatOnly
                  ? "No chat-ready games match"
                  : "No games match these filters"}
            </p>
            {!searching && activeFilterCount > 0 && (
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="text-sm text-accent hover:underline"
              >
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

          {/* Invisible sentinel — scrolling near it auto-loads the next page.
              The chat-ready view isn't paginated, so it has no sentinel. */}
          {!chatOnly && (
            <>
              <div ref={sentinelRef} aria-hidden className="h-px" />
              {active.status === "LoadingMore" && (
                <p className="mt-8 text-center text-sm text-muted">Loading…</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
