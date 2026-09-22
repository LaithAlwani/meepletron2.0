"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePaginatedQuery, useMutation } from "convex/react";
import { Plus, Dices } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { buttonClasses } from "@/components/ui/Button";
import { Fab } from "@/components/ui/Fab";
import { PlayPostCard } from "@/components/plays/PlayPostCard";
import { LogPlayWizard } from "@/components/plays/LogPlayWizard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useScrollRestore } from "@/components/lib/useScrollRestore";
import { useInfiniteScroll } from "@/components/lib/useInfiniteScroll";

const PAGE = 15;

/**
 * The signed-in user's full plays feed — every play they took part in (any
 * visibility), rendered in the home-feed play-post style. Shared by the /plays
 * page and the owner's profile Plays tab. Must be rendered only when signed in.
 */
export function MyPlaysFeed() {
  const [wizardOpen, setWizardOpen] = useState(false);

  // Claim any plays a friend tagged us in by email (idempotent, once per visit).
  const claim = useMutation(api.plays.claimMyPlays);
  useEffect(() => {
    void claim({});
  }, [claim]);

  // Restore scroll + how-many-loaded when returning from a play's detail page.
  const { initialNumItems, restoreIfReady, save } = useScrollRestore(
    "plays-feed",
    PAGE,
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.plays.myPlays,
    {},
    { initialNumItems },
  );
  useEffect(() => {
    restoreIfReady(results.length);
  }, [results.length, restoreIfReady]);

  const sentinel = useInfiniteScroll(() => loadMore(PAGE), {
    canLoadMore: status === "CanLoadMore",
  });

  return (
    <div>
      {status === "LoadingFirstPage" ? (
        <PlaysSkeleton />
      ) : results.length === 0 ? (
        <EmptyState
          title="No plays yet."
          description={
            <>
              Log your first game, or import your history in{" "}
              <Link
                href="/settings"
                className="font-semibold text-accent hover:underline"
              >
                Settings
              </Link>
              .
            </>
          }
          action={
            <button
              onClick={() => setWizardOpen(true)}
              className={buttonClasses("primary", "sm")}
            >
              <Plus className="h-4 w-4" />
              Log a play
            </button>
          }
        />
      ) : (
        <>
          <ul
            className="space-y-3"
            onClickCapture={(e) => {
              if ((e.target as HTMLElement).closest("a")) save(results.length);
            }}
          >
            {results.map((p) => (
              <li key={p._id}>
                <PlayPostCard play={p} />
              </li>
            ))}
          </ul>
          <div ref={sentinel} aria-hidden className="h-px" />
          {status === "LoadingMore" && (
            <p className="mt-6 text-center text-sm text-muted">Loading…</p>
          )}
        </>
      )}

      <Fab icon={Dices} label="Log a play" onClick={() => setWizardOpen(true)} />
      <LogPlayWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

function PlaysSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="h-36 animate-pulse rounded-2xl border border-border-muted bg-surface"
        />
      ))}
    </ul>
  );
}
