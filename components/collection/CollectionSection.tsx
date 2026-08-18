"use client";

import Link from "next/link";
import {
  useQuery,
  usePaginatedQuery,
  Authenticated,
  Unauthenticated,
} from "convex/react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { GameCard } from "@/components/boardgames/GameCard";
import { CardRail } from "@/components/boardgames/CardRail";
import {
  COLLECTION_STATUSES,
  type CollStatus,
} from "@/components/collection/status";

// Same fixed-width rail cell the library rows use.
const cellClass = "w-40 shrink-0 snap-start sm:w-44";

/** "Your Collection" — one horizontal rail per list, shown below the library. */
export function CollectionSection() {
  return (
    <section>
      <h2 className="font-display mb-4 text-2xl font-extrabold tracking-tight">
        Your collection
      </h2>
      <Unauthenticated>
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          <Link href="/auth" className="font-semibold text-accent hover:underline">
            Sign in
          </Link>{" "}
          to build your collection and sync from BoardGameGeek.
        </div>
      </Unauthenticated>
      <Authenticated>
        <CollectionRows />
      </Authenticated>
    </section>
  );
}

function CollectionRows() {
  const counts = useQuery(api.bggSync.myCollectionCounts);
  const jobs = useQuery(api.bggSync.myJobs);

  const job = jobs?.find((j) => j.kind === "collection");
  const syncing =
    job &&
    ["queued", "waiting", "running", "sweeping", "enriching"].includes(
      job.status,
    );

  if (counts === undefined) return <RailSkeleton />;

  if (counts.all === 0) {
    return (
      <div className="p-6 text-center text-muted">
        <p className="font-medium">{syncing ? "Syncing…" : "Nothing here yet."}</p>
        {!syncing && (
          <>
            <p className="mt-1 text-sm">Add games from the library, or</p>
            <Link
              href="/settings"
              className="mt-1 inline-block text-sm font-semibold text-accent hover:underline"
            >
              link BoardGameGeek
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {COLLECTION_STATUSES.map((status) => (
        <CollectionRow
          key={status.filter}
          status={status}
          total={counts[status.filter]}
        />
      ))}
    </div>
  );
}

function RailSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 2 }).map((_, r) => (
        <div key={r}>
          <div className="mb-3 h-4 w-28 animate-pulse rounded bg-surface-2" />
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
      <h3 className="text-sm font-bold uppercase tracking-[0.14em]">{title}</h3>
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

function CollectionRow({ status, total }: { status: CollStatus; total: number }) {
  const { results, status: qStatus } = usePaginatedQuery(
    api.bggSync.myCollection,
    { filter: status.filter },
    { initialNumItems: 20 },
  );

  if (total === 0) return null;

  const href = `/boardgames/collection/${status.slug}`;
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
        <CardRail>
          {results.map((game, i) => (
            <li key={game._id} className={cellClass}>
              <GameCard game={game} index={i} />
            </li>
          ))}
        </CardRail>
      )}
    </section>
  );
}
