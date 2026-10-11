"use client";

import { useRef, useState } from "react";

type Saved = { count: number; y: number };

/**
 * Restores scroll position + how many items were loaded for a client-paginated
 * list when the user comes *back* to it (e.g. Back from a detail page), so they
 * land exactly where they were scrolling.
 *
 * Usage:
 *   const { initialNumItems, restoreIfReady, save } = useScrollRestore(key, 20);
 *   const { results, status, loadMore } = usePaginatedQuery(q, args, { initialNumItems });
 *   useEffect(() => restoreIfReady(results.length), [results.length]);
 *   // on each item link: onClick={() => save(results.length)}
 *
 * A *fresh* visit (nothing saved) uses the default page size and starts at the
 * top — the saved state is written only by `save()` (on navigating to a detail)
 * and consumed once on return, so a brand-new navigation to the list resets.
 */
export function useScrollRestore(key: string, defaultCount: number) {
  const K = `scroll-restore:${key}`;
  const doneRef = useRef(false);

  // Read the saved snapshot once, at init (never during a later render).
  const [{ initialNumItems, saved }] = useState<{
    initialNumItems: number;
    saved: Saved | null;
  }>(() => {
    if (typeof window === "undefined") {
      return { initialNumItems: defaultCount, saved: null };
    }
    try {
      const raw = sessionStorage.getItem(K);
      if (raw) {
        const s = JSON.parse(raw) as Saved;
        // Load enough to reach where they were (capped), in one page.
        return {
          initialNumItems: Math.min(Math.max(s.count, defaultCount), 500),
          saved: s,
        };
      }
    } catch {
      /* ignore malformed / unavailable storage */
    }
    return { initialNumItems: defaultCount, saved: null };
  });

  /** Jump back to the saved scroll once enough items have rendered. */
  function restoreIfReady(loadedCount: number) {
    if (doneRef.current || !saved) return;
    if (loadedCount >= saved.count) {
      // Next frame, so the restored rows have been laid out.
      requestAnimationFrame(() => window.scrollTo(0, saved.y));
      doneRef.current = true;
      try {
        sessionStorage.removeItem(K);
      } catch {
        /* ignore */
      }
    }
  }

  /** Remember position + loaded count; call right before opening a detail. */
  function save(loadedCount: number) {
    try {
      sessionStorage.setItem(
        K,
        JSON.stringify({ count: loadedCount, y: window.scrollY }),
      );
    } catch {
      /* ignore */
    }
  }

  return { initialNumItems, restoreIfReady, save };
}
