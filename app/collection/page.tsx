"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useQuery,
  usePaginatedQuery,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import { GameCard } from "@/components/boardgames/GameCard";
import { buttonClasses } from "@/components/ui/Button";

type Filter = "owned" | "wishlist" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "owned", label: "Owned" },
  { value: "wishlist", label: "Wishlist" },
];

const gridClass = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";

export default function CollectionPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display mb-5 text-3xl font-extrabold tracking-tight">
        Your collection
      </h1>
      <AuthLoading>
        <CardSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">
            Sign in to build your collection and sync from BoardGameGeek.
          </p>
          <Link href="/auth" className={`mt-4 ${buttonClasses("primary", "sm")}`}>
            Sign in
          </Link>
        </div>
      </Unauthenticated>
      <Authenticated>
        <CollectionBody />
      </Authenticated>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className={gridClass}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="aspect-4/3 animate-pulse rounded-2xl bg-surface-2"
        />
      ))}
    </div>
  );
}

function CollectionBody() {
  const [filter, setFilter] = useState<Filter>("all");
  const account = useQuery(api.bggSync.myAccount);
  const jobs = useQuery(api.bggSync.myJobs);
  const { results, status, loadMore } = usePaginatedQuery(
    api.bggSync.myCollection,
    { filter },
    { initialNumItems: 24 },
  );

  const job = jobs?.find((j) => j.kind === "collection");
  const syncing =
    job &&
    ["queued", "waiting", "running", "sweeping", "enriching"].includes(
      job.status,
    );

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={
              filter === f.value
                ? buttonClasses("primary", "sm")
                : buttonClasses("ghost", "sm")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {account === null && (
        <p className="mb-4 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted">
          Heart a game to add it to your wishlist, or bookmark it as owned.{" "}
          <Link
            href="/settings"
            className="font-semibold text-accent hover:underline"
          >
            Link BoardGameGeek
          </Link>{" "}
          to import your whole collection.
        </p>
      )}

      {syncing && (
        <p className="mb-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
          {job.status === "enriching"
            ? `Adding games to your library… ${job.enrichProcessed ?? 0}${
                job.enrichTotal != null ? ` / ${job.enrichTotal}` : ""
              }`
            : job.status === "waiting"
              ? "BoardGameGeek is preparing your collection — this can take a minute."
              : `Syncing… ${job.processed} games so far.`}
        </p>
      )}
      {job?.status === "error" && job.error && (
        <p className="mb-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-red-500">
          {job.error}
        </p>
      )}

      {status === "LoadingFirstPage" ? (
        <CardSkeleton />
      ) : results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <p className="font-medium">
            {syncing ? "Syncing…" : "Nothing here yet."}
          </p>
          {!syncing && (
            <p className="mt-1 text-sm">
              {filter === "wishlist"
                ? "Heart games in the library to add them here."
                : filter === "owned"
                  ? "Bookmark games you own, or link BoardGameGeek to import them."
                  : "Heart or bookmark games in the library, or link BoardGameGeek."}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className={gridClass}>
            {results.map((game, i) => (
              <GameCard key={game._id} game={game} index={i} />
            ))}
          </div>
          {status === "CanLoadMore" && (
            <button
              onClick={() => loadMore(24)}
              className={`mt-4 w-full ${buttonClasses("ghost", "md")}`}
            >
              Load more
            </button>
          )}
          {status === "LoadingMore" && (
            <p className="mt-4 text-center text-sm text-muted">Loading…</p>
          )}
        </>
      )}
    </>
  );
}
