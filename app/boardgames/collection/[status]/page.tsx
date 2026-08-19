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
import { ChevronLeft } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { GameCard } from "@/components/boardgames/GameCard";
import { SortControl } from "@/components/boardgames/SortControl";
import { buttonClasses } from "@/components/ui/Button";
import { statusBySlug, type CollStatus } from "@/components/collection/status";
import { DEFAULT_SORT, type GameSortKey } from "@/convex/lib/gameSort";

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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/boardgames"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Library
      </Link>
      <h1 className="font-display mb-5 flex items-center gap-2 text-3xl font-extrabold tracking-tight">
        <status.icon className="h-6 w-6 text-accent" />
        {status.title}
      </h1>

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
  const [sort, setSort] = useState<GameSortKey>(DEFAULT_SORT);
  const { results, status: qStatus, loadMore } = usePaginatedQuery(
    api.bggSync.myCollection,
    { filter: status.filter, sort },
    { initialNumItems: 24 },
  );

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

  const content =
    qStatus === "LoadingFirstPage" ? (
      <GridSkeleton />
    ) : results.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
        <p className="font-medium">Nothing here yet.</p>
        <p className="mt-1 text-sm">{status.empty}</p>
      </div>
    ) : (
      <>
        <div className={gridClass}>
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
      <div className="mb-4 flex justify-end">
        <SortControl value={sort} onChange={setSort} className="w-40" />
      </div>
      {content}
    </>
  );
}
