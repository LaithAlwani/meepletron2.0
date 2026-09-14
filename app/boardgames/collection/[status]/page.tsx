"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  usePaginatedQuery,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { Search, SlidersHorizontal } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { GameCard } from "@/components/boardgames/GameCard";
import { SortControl } from "@/components/boardgames/SortControl";
import { ChatReadyToggle } from "@/components/boardgames/ChatReadyToggle";
import { FilterDrawer } from "@/components/boardgames/FilterDrawer";
import {
  useLibraryFilters,
  toLibraryArgs,
} from "@/components/boardgames/useLibraryFilters";
import { useScrollRestore } from "@/components/lib/useScrollRestore";
import { buttonClasses } from "@/components/ui/Button";
import { BackButton } from "@/components/ui/BackButton";
import { statusBySlug, type CollStatus } from "@/components/collection/status";

const gridClass = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";

export default function CollectionListPage({
  params,
}: {
  params: Promise<{ status: string }>;
}) {
  const { status: slug } = use(params);
  const status = statusBySlug(slug);
  if (!status) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-3 nav:pt-8">
      {/* Desktop only — mobile gets the same three things in the top bar.
          Back and title share one row so the arrow costs no vertical space. */}
      <div className="mb-5 hidden items-center gap-3 nav:flex">
        <BackButton fallbackHref="/boardgames" className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-foreground" />
        <h1 className="font-display flex items-center gap-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
          <status.icon className="h-6 w-6 text-accent" />
          {status.title}
        </h1>
      </div>

      <AuthLoading>
        <GridSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">Sign in to view your collection.</p>
          <Link href="/auth" className={`mt-4 ${buttonClasses("primary", "sm")}`}>
            Sign in
          </Link>
        </div>
      </Unauthenticated>
      <Authenticated>
        <ListBody status={status} />
      </Authenticated>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className={gridClass}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="aspect-4/3 animate-pulse rounded-2xl bg-surface-2" />
      ))}
    </div>
  );
}

function ListBody({ status }: { status: CollStatus }) {
  // Independent, persisted filter state per status (its own storage key), so it
  // doesn't touch the main library — and so a Back navigation reconstructs the
  // exact same list for scroll restoration. Defaults to A–Z (the cheap path).
  const {
    term,
    setTerm,
    debounced,
    searching,
    filters,
    setFilters,
    sort,
    setSort,
    clear,
    activeCount,
  } = useLibraryFilters(`collection-filters:${status.filter}`, "title");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Restore scroll + how-many-loaded when returning from a game's detail page.
  const { initialNumItems, restoreIfReady, save } = useScrollRestore(
    `collection:${status.filter}`,
    24,
  );
  const { results, status: qStatus, loadMore } = usePaginatedQuery(
    api.bggSync.myCollection,
    { filter: status.filter, sort, ...toLibraryArgs(debounced, filters) },
    { initialNumItems },
  );
  useEffect(() => {
    restoreIfReady(results.length);
  }, [results.length, restoreIfReady]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || qStatus !== "CanLoadMore") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore(24);
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [qStatus, loadMore]);

  const narrowed = searching || activeCount > 0;

  const content =
    qStatus === "LoadingFirstPage" ? (
      <GridSkeleton />
    ) : results.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
        <p className="font-medium">
          {narrowed ? "No games match." : "Nothing here yet."}
        </p>
        <p className="mt-1 text-sm">
          {narrowed
            ? "Try a different search or clear your filters."
            : status.empty}
        </p>
      </div>
    ) : (
      <>
        {/* Save scroll + loaded count when a card link is clicked, so Back lands
            where they were. */}
        <div
          className={gridClass}
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest("a")) save(results.length);
          }}
        >
          {results.map((game, i) => (
            <GameCard key={game._id} game={game} index={i} />
          ))}
        </div>
        <div ref={sentinelRef} aria-hidden className="h-px" />
        {qStatus === "LoadingMore" && (
          <p className="mt-8 text-center text-sm text-muted">Loading…</p>
        )}
      </>
    );

  return (
    <>
      {/* Search + chat-ready + sort + filters — the same browse controls, but
          the search only searches THIS list. */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search this list…"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3 text-sm outline-none transition-shadow focus:border-accent/50 focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <ChatReadyToggle
            active={filters.chatOnly}
            onToggle={() =>
              setFilters({ ...filters, chatOnly: !filters.chatOnly })
            }
          />
          {!searching && (
            <SortControl
              value={sort}
              onChange={setSort}
              className="flex-1 sm:w-40 sm:flex-none"
            />
          )}
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

      {content}

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        setFilters={setFilters}
        activeCount={activeCount}
        onClear={clear}
      />
    </>
  );
}
