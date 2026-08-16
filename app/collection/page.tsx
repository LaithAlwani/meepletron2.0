"use client";

import { useEffect, useRef, useState } from "react";
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

type Section = "all" | "owned" | "notOwned";
type SubStatus = "want" | "wantToPlay" | "forTrade" | "prevOwned";
type CountKey =
  | "all"
  | "owned"
  | "notOwned"
  | "ownedWantToPlay"
  | "ownedForTrade"
  | "notOwnedWant"
  | "notOwnedPrevOwned";

const PRIMARY: { value: Section; label: string; count: CountKey }[] = [
  { value: "all", label: "All", count: "all" },
  { value: "owned", label: "Owned", count: "owned" },
  { value: "notOwned", label: "Not owned", count: "notOwned" },
];

const SUBS: Record<
  "owned" | "notOwned",
  { value: SubStatus | null; label: string; count: CountKey }[]
> = {
  owned: [
    { value: null, label: "All", count: "owned" },
    { value: "wantToPlay", label: "Want to play", count: "ownedWantToPlay" },
    { value: "forTrade", label: "For trade", count: "ownedForTrade" },
  ],
  notOwned: [
    { value: null, label: "All", count: "notOwned" },
    { value: "want", label: "Want", count: "notOwnedWant" },
    { value: "prevOwned", label: "Previously owned", count: "notOwnedPrevOwned" },
  ],
};

function emptyHint(section: Section, status: SubStatus | null): string {
  if (status === "want") return "Heart games in the library to add them to Want.";
  if (status === "wantToPlay")
    return "Mark games “want to play” on the card or on BoardGameGeek.";
  if (status === "forTrade")
    return "Mark owned games “for trade” on the card or on BoardGameGeek.";
  if (status === "prevOwned")
    return "Mark games “previously owned” on the card or on BoardGameGeek.";
  if (section === "owned")
    return "Bookmark games you own, or link BoardGameGeek to import them.";
  if (section === "notOwned")
    return "Heart games you want, or link BoardGameGeek to import them.";
  return "Heart or bookmark games in the library, or link BoardGameGeek.";
}

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
  const [section, setSection] = useState<Section>("all");
  const [sub, setSub] = useState<SubStatus | null>(null);
  const account = useQuery(api.bggSync.myAccount);
  const jobs = useQuery(api.bggSync.myJobs);
  const counts = useQuery(api.bggSync.myCollectionCounts);
  const { results, status, loadMore } = usePaginatedQuery(
    api.bggSync.myCollection,
    { section, status: sub ?? undefined },
    { initialNumItems: 24 },
  );

  const job = jobs?.find((j) => j.kind === "collection");
  const syncing =
    job &&
    ["queued", "waiting", "running", "sweeping", "enriching"].includes(
      job.status,
    );

  // Auto-load the next page when the sentinel nears the viewport (infinite scroll).
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

  const subs = section === "all" ? null : SUBS[section];

  return (
    <>
      {/* Primary: All / Owned / Not owned */}
      <div className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {PRIMARY.map((p) => (
          <button
            key={p.value}
            onClick={() => {
              setSection(p.value);
              setSub(null);
            }}
            className={`shrink-0 ${
              section === p.value
                ? buttonClasses("primary", "sm")
                : buttonClasses("ghost", "sm")
            }`}
          >
            {p.label}
            {counts && (
              <span className="ml-1.5 tabular-nums opacity-60">
                {counts[p.count]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Contextual sub-filters for the active section */}
      {subs && (
        <div className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {subs.map((s) => (
            <button
              key={s.label}
              onClick={() => setSub(s.value)}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                sub === s.value
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {s.label}
              {counts && (
                <span className="ml-1 tabular-nums opacity-60">
                  {counts[s.count]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {account === null && (
        <p className="mb-4 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted">
          Heart a game to add it to Want, or bookmark it as owned.{" "}
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
            <p className="mt-1 text-sm">{emptyHint(section, sub)}</p>
          )}
        </div>
      ) : (
        <>
          <div className={gridClass}>
            {results.map((game, i) => (
              <GameCard key={game._id} game={game} index={i} showStatus />
            ))}
          </div>
          <div ref={sentinelRef} aria-hidden className="h-px" />
          {status === "LoadingMore" && (
            <p className="mt-8 text-center text-sm text-muted">Loading…</p>
          )}
        </>
      )}
    </>
  );
}
