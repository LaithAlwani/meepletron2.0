"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePaginatedQuery, Authenticated, Unauthenticated } from "convex/react";
import { api } from "@/convex/_generated/api";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Surface";
import { PostFeedItem } from "@/components/plays/PostFeedItem";
import { PostComposer } from "@/components/plays/PostComposer";

/** The home feed: a composer (signed-in) over everyone's shared posts. */
export function HomeFeed() {
  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:py-8">
      <Authenticated>
        <PostComposer />
      </Authenticated>
      <Unauthenticated>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-muted bg-surface p-4">
          <p className="text-sm text-muted">
            Sign in to share plays, photos and your Top Games lists.
          </p>
          <Link href="/auth" className={buttonClasses("primary", "sm")}>
            Sign in
          </Link>
        </div>
      </Unauthenticated>

      <Feed />
    </div>
  );
}

function Feed() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.posts.feed,
    {},
    { initialNumItems: 10 },
  );
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || status !== "CanLoadMore") return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && loadMore(10),
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [status, loadMore]);

  if (status === "LoadingFirstPage") {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full rounded-2xl" />
        ))}
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
        <p className="font-medium">Nothing shared yet.</p>
        <p className="mt-1 text-sm">
          Be the first — share a photo, a play, or one of your Top Games lists.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="space-y-4">
        {results.map((item) => (
          <PostFeedItem key={item._id} item={item} />
        ))}
      </div>
      <div ref={sentinel} aria-hidden className="h-px" />
      {status === "LoadingMore" && (
        <p className="mt-6 text-center text-sm text-muted">Loading…</p>
      )}
    </>
  );
}
