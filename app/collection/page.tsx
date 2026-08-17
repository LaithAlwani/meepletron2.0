"use client";

import Link from "next/link";
import {
  useQuery,
  usePaginatedQuery,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { GameCard } from "@/components/boardgames/GameCard";
import { buttonClasses } from "@/components/ui/Button";
import {
  COLLECTION_STATUSES,
  type CollStatus,
} from "@/components/collection/status";

// Fixed-width cell so the library GameCard sits in a horizontal, Netflix-style rail.
const cellClass = "w-40 shrink-0 snap-start sm:w-44";

export default function CollectionPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display mb-5 text-3xl font-extrabold tracking-tight">
        Your collection
      </h1>
      <AuthLoading>
        <RowSkeleton />
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

function RowSkeleton() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 2 }).map((_, r) => (
        <div key={r}>
          <div className="mb-3 h-4 w-32 animate-pulse rounded bg-surface-2" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={`${cellClass} aspect-4/3 animate-pulse rounded-2xl bg-surface-2`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CollectionBody() {
  const account = useQuery(api.bggSync.myAccount);
  const jobs = useQuery(api.bggSync.myJobs);
  const counts = useQuery(api.bggSync.myCollectionCounts);

  const job = jobs?.find((j) => j.kind === "collection");
  const syncing =
    job &&
    ["queued", "waiting", "running", "sweeping", "enriching"].includes(
      job.status,
    );

  const banners = (
    <>
      {account === null && (
        <p className="mb-4 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted">
          Add games to your collection from any card, or{" "}
          <Link
            href="/settings"
            className="font-semibold text-accent hover:underline"
          >
            link BoardGameGeek
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
    </>
  );

  if (counts === undefined) {
    return (
      <>
        {banners}
        <RowSkeleton />
      </>
    );
  }

  if (counts.all === 0) {
    return (
      <>
        {banners}
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <p className="font-medium">{syncing ? "Syncing…" : "Nothing here yet."}</p>
          {!syncing && (
            <p className="mt-1 text-sm">
              Add games to your collection from the library, or link
              BoardGameGeek.
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {banners}
      <div className="space-y-8">
        {COLLECTION_STATUSES.map((status) => (
          <CollectionRow
            key={status.filter}
            status={status}
            total={counts[status.filter]}
          />
        ))}
      </div>
    </>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  count,
  href,
  showAll,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  href: string;
  showAll: boolean;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 text-accent">
      <Icon className="h-4 w-4" />
      <h2 className="text-sm font-bold uppercase tracking-[0.14em]">{title}</h2>
      <span className="text-xs font-semibold text-subtle">{count}</span>
      {showAll && (
        <Link
          href={href}
          className="ml-auto text-xs font-semibold text-accent hover:underline"
        >
          View all
        </Link>
      )}
    </div>
  );
}

function CollectionRow({
  status,
  total,
}: {
  status: CollStatus;
  total: number;
}) {
  const { results, status: qStatus } = usePaginatedQuery(
    api.bggSync.myCollection,
    { filter: status.filter },
    { initialNumItems: 20 },
  );

  // Empty lists are simply omitted from the overview.
  if (total === 0) return null;

  const href = `/collection/${status.slug}`;
  const remaining = total - results.length;

  return (
    <section>
      <SectionHeader
        icon={status.icon}
        title={status.title}
        count={total}
        href={href}
        showAll={remaining > 0}
      />
      {qStatus === "LoadingFirstPage" && results.length === 0 ? (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`${cellClass} aspect-4/3 animate-pulse rounded-2xl bg-surface-2`}
            />
          ))}
        </div>
      ) : (
        <ul className="themed-scroll -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          {results.map((game, i) => (
            <li key={game._id} className={cellClass}>
              <GameCard game={game} index={i} />
            </li>
          ))}
          {remaining > 0 && (
            <li className={cellClass}>
              <Link
                href={href}
                className="flex aspect-4/3 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border text-center text-sm font-semibold text-muted transition-colors hover:border-accent/50 hover:text-accent"
              >
                +{remaining}
                <span className="text-xs font-medium">more</span>
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
