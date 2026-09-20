"use client";

import { useEffect, useRef } from "react";

/**
 * Infinite-scroll trigger against the viewport. Attach the returned ref to a
 * sentinel element placed after a list; when it scrolls within `rootMargin` and
 * `canLoadMore` is true, `onLoadMore` fires. Replaces the hand-rolled
 * IntersectionObserver blocks across the paginated lists.
 *
 * `onLoadMore` is read from a ref, so passing a fresh arrow each render (e.g.
 * `() => loadMore(20)`) does NOT re-create the observer — it only re-subscribes
 * when `canLoadMore` or `rootMargin` change.
 *
 * (Lists that observe inside a custom scroll container keep their own observer,
 * since the root element must be read inside the effect, not at render time.)
 */
export function useInfiniteScroll(
  onLoadMore: () => void,
  {
    canLoadMore,
    rootMargin = "600px",
  }: { canLoadMore: boolean; rootMargin?: string },
) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const cb = useRef(onLoadMore);
  cb.current = onLoadMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !canLoadMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) cb.current();
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canLoadMore, rootMargin]);

  return sentinelRef;
}
