"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePaginatedQuery, useMutation } from "convex/react";
import { Images, Dices, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/Surface";
import { Fab } from "@/components/ui/Fab";
import { buttonClasses } from "@/components/ui/Button";
import { LogPlayWizard } from "@/components/plays/LogPlayWizard";
import { useScrollRestore } from "@/components/lib/useScrollRestore";

const PAGE = 20;

/**
 * The profile "Plays" tab: an Instagram-style square-image grid (photo, or the
 * game cover as a fallback, with the game title). Loads 20 at a time on scroll,
 * and restores scroll position when the user comes back from a play's detail.
 * Owner sees all their plays; other viewers see only public ones.
 */
export function PlaysGrid({
  isSelf,
  username,
}: {
  isSelf: boolean;
  username: string;
}) {
  const scopeKey = isSelf ? "me" : username;
  const { initialNumItems, restoreIfReady, save } = useScrollRestore(
    `plays:${scopeKey}`,
    PAGE,
  );
  const [wizardOpen, setWizardOpen] = useState(false);

  // Claim any plays a friend tagged us in by email (idempotent; owner only).
  const claim = useMutation(api.plays.claimMyPlays);
  useEffect(() => {
    if (isSelf) void claim({});
  }, [isSelf, claim]);

  const mine = usePaginatedQuery(
    api.plays.myPlays,
    isSelf ? {} : "skip",
    { initialNumItems },
  );
  const theirs = usePaginatedQuery(
    api.plays.userPublicPlaysPaged,
    isSelf ? "skip" : { username },
    { initialNumItems },
  );
  const { results, status, loadMore } = isSelf ? mine : theirs;

  useEffect(() => {
    restoreIfReady(results.length);
  }, [results.length, restoreIfReady]);

  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || status !== "CanLoadMore") return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && loadMore(PAGE),
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [status, loadMore]);

  if (status === "LoadingFirstPage") {
    return (
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <>
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <p className="font-medium">
            {isSelf ? "No plays logged yet." : "No public plays yet."}
          </p>
          {isSelf && (
            <button
              onClick={() => setWizardOpen(true)}
              className={`mt-4 ${buttonClasses("primary", "sm")}`}
            >
              <Plus className="h-4 w-4" />
              Log a play
            </button>
          )}
        </div>
        {isSelf && (
          <>
            <Fab
              icon={Dices}
              label="Log a play"
              onClick={() => setWizardOpen(true)}
            />
            <LogPlayWizard
              open={wizardOpen}
              onClose={() => setWizardOpen(false)}
            />
          </>
        )}
      </>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-3 gap-1">
        {results.map((p) => (
          <li key={p._id}>
            <Link
              href={`/plays/${p._id}`}
              onClick={() => save(results.length)}
              className="group relative block aspect-square overflow-hidden rounded-md bg-surface-2"
            >
              {p.photoUrl || p.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.photoUrl ?? p.coverUrl ?? undefined}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-subtle">
                  <Dices className="h-8 w-8" />
                </div>
              )}
              {p.photoCount > 1 && (
                <span className="absolute right-1.5 top-1.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                  <Images className="h-4 w-4" />
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-1.5 pt-6">
                <p className="truncate text-xs font-semibold text-white">
                  {p.title}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <div ref={sentinel} aria-hidden className="h-px" />
      {status === "LoadingMore" && (
        <p className="py-4 text-center text-sm text-muted">Loading more…</p>
      )}
      {isSelf && (
        <>
          <Fab
            icon={Dices}
            label="Log a play"
            onClick={() => setWizardOpen(true)}
          />
          <LogPlayWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
        </>
      )}
    </>
  );
}
