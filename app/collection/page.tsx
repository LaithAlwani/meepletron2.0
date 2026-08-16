"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import {
  useQuery,
  usePaginatedQuery,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import { MediaRow } from "@/components/boardgames/MediaRow";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Surface";

type Filter = "owned" | "wishlist" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "owned", label: "Owned" },
  { value: "wishlist", label: "Wishlist" },
  { value: "all", label: "All" },
];

export default function CollectionPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display mb-5 text-3xl font-extrabold tracking-tight">
        Your collection
      </h1>
      <AuthLoading>
        <RowSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">
            Sign in to sync your BoardGameGeek collection.
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

function RowSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
        >
          <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
          <Skeleton className="h-4 flex-1" />
        </li>
      ))}
    </ul>
  );
}

function CollectionBody() {
  const [filter, setFilter] = useState<Filter>("all");
  const account = useQuery(api.bggSync.myAccount);
  const jobs = useQuery(api.bggSync.myJobs);
  const { results, status, loadMore } = usePaginatedQuery(
    api.bggSync.myCollection,
    { filter },
    { initialNumItems: 30 },
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
          {job.status === "waiting"
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
        <RowSkeleton />
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
          <ul className="space-y-3">
            {results.map((row) => (
              <MediaRow
                key={row._id}
                href={row.slug ? `/boardgames/${row.slug}` : undefined}
                thumbUrl={row.thumbnailUrl}
                title={row.title}
                subtitle={
                  [
                    row.year,
                    row.numPlays ? `${row.numPlays} plays` : null,
                    row.isExpansion ? "Expansion" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || null
                }
                meta={row.userRating ? `★ ${row.userRating}` : undefined}
                trailing={
                  row.slug ? (
                    <Link
                      href={`/boardgames/${row.slug}/chat`}
                      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold text-accent transition-colors hover:bg-surface-2"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Chat
                    </Link>
                  ) : undefined
                }
              />
            ))}
          </ul>
          {status === "CanLoadMore" && (
            <button
              onClick={() => loadMore(30)}
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
