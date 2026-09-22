"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  usePaginatedQuery,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import { GameCard } from "@/components/boardgames/GameCard";
import { LibraryControls } from "@/components/boardgames/LibraryControls";
import { ActiveFilterBar } from "@/components/boardgames/ActiveFilterBar";
import { CARD_GRID, GameGridSkeleton } from "@/components/boardgames/GameGrid";
import { FilterDrawer } from "@/components/boardgames/FilterDrawer";
import {
  useLibraryFilters,
  toLibraryArgs,
} from "@/components/boardgames/useLibraryFilters";
import { useScrollRestore } from "@/components/lib/useScrollRestore";
import { useInfiniteScroll } from "@/components/lib/useInfiniteScroll";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { BackButton } from "@/components/ui/BackButton";
import { statusBySlug, type CollStatus } from "@/components/collection/status";

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
        <GameGridSkeleton />
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

function ListBody({ status }: { status: CollStatus }) {
  // Independent, persisted filter state per status (its own storage key), so it
  // doesn't touch the main library — and so a Back navigation reconstructs the
  // exact same list for scroll restoration. Defaults to A–Z (the cheap path).
  const { filters, setFilters, sort, setSort, clear, activeCount } =
    useLibraryFilters(`collection-filters:${status.filter}`, "title");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Restore scroll + how-many-loaded when returning from a game's detail page.
  const { initialNumItems, restoreIfReady, save } = useScrollRestore(
    `collection:${status.filter}`,
    24,
  );
  const { results, status: qStatus, loadMore } = usePaginatedQuery(
    api.bggSync.myCollection,
    { filter: status.filter, sort, ...toLibraryArgs("", filters) },
    { initialNumItems },
  );
  useEffect(() => {
    restoreIfReady(results.length);
  }, [results.length, restoreIfReady]);

  const sentinelRef = useInfiniteScroll(() => loadMore(24), {
    canLoadMore: qStatus === "CanLoadMore",
  });

  const narrowed = activeCount > 0;

  const content =
    qStatus === "LoadingFirstPage" ? (
      <GameGridSkeleton />
    ) : results.length === 0 ? (
      <EmptyState
        title={narrowed ? "No games match." : "Nothing here yet."}
        description={narrowed ? "Try clearing your filters." : status.empty}
      />
    ) : (
      <>
        {/* Save scroll + loaded count when a card link is clicked, so Back lands
            where they were. */}
        <div
          className={CARD_GRID}
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
      {/* Sort + filters — search lives in the top nav. */}
      <LibraryControls
        filters={filters}
        setFilters={setFilters}
        sort={sort}
        setSort={setSort}
        activeCount={activeCount}
        onOpenFilters={() => setDrawerOpen(true)}
        className="mb-4"
      />

      <ActiveFilterBar term="" activeCount={activeCount} onClear={clear} />

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
