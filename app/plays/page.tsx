"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  usePaginatedQuery,
  useMutation,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { Plus, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageTitle } from "@/components/ui/PageTitle";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Surface";
import { PlayCard } from "@/components/plays/PlayCard";
import { LogPlayWizard } from "@/components/plays/LogPlayWizard";

export default function PlaysPage() {
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <PageTitle>My plays</PageTitle>
        <div className="flex items-center gap-2">
          <Link
            href="/plays/people"
            className={buttonClasses("ghost", "md")}
            title="Manage friends"
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Friends</span>
          </Link>
          <button
            onClick={() => setWizardOpen(true)}
            aria-label="Log a play"
            className={buttonClasses("primary", "md")}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Log a play</span>
          </button>
        </div>
      </div>

      <AuthLoading>
        <PlaysSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">Sign in to record your plays.</p>
          <Link href="/auth" className={`mt-4 ${buttonClasses("primary", "sm")}`}>
            Sign in
          </Link>
        </div>
      </Unauthenticated>
      <Authenticated>
        <MyPlays onLog={() => setWizardOpen(true)} />
      </Authenticated>

      <LogPlayWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

function PlaysSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5">
          <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function MyPlays({ onLog }: { onLog: () => void }) {
  // Claim any plays a friend tagged us in by email (idempotent, once per visit).
  const claim = useMutation(api.plays.claimMyPlays);
  useEffect(() => {
    void claim({});
  }, [claim]);

  const { results, status, loadMore } = usePaginatedQuery(
    api.plays.myPlays,
    {},
    { initialNumItems: 15 },
  );

  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || status !== "CanLoadMore") return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && loadMore(15),
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [status, loadMore]);

  if (status === "LoadingFirstPage") return <PlaysSkeleton />;

  if (results.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
        <p className="font-medium">No plays yet.</p>
        <p className="mt-1 text-sm">
          Log your first game, or import your history from BoardGameGeek in{" "}
          <Link href="/settings" className="font-semibold text-accent hover:underline">
            Settings
          </Link>
          .
        </p>
        <button onClick={onLog} className={`mt-4 ${buttonClasses("primary", "sm")}`}>
          <Plus className="h-4 w-4" />
          Log a play
        </button>
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border-muted">
        {results.map((p) => (
          <li key={p._id} className="py-0.5">
            <PlayCard play={p} />
          </li>
        ))}
      </ul>
      <div ref={sentinel} aria-hidden className="h-px" />
      {status === "LoadingMore" && (
        <p className="mt-6 text-center text-sm text-muted">Loading…</p>
      )}
    </>
  );
}
