"use client";

import { useEffect } from "react";
import { ReactLenis, useLenis } from "lenis/react";
import { useReducedMotionPref } from "@/components/lib/useReducedMotionPref";

/**
 * Site-wide smooth scroll on the window. `root` means Lenis drives the real
 * document scroll (no transformed wrapper), so native scroll events + fixed
 * chrome keep working and `window.scrollY` stays accurate. Touch stays native
 * (Lenis default) — that keeps the mobile vaul sheets and momentum scroll intact.
 *
 * When reduced motion is requested, Lenis is not mounted at all (native scroll);
 * `useLenis()` then returns undefined and callers fall back to `window.scrollTo`.
 * Nested scrollers (chat list, etc.) opt out with `data-lenis-prevent`, and open
 * sheets stop Lenis (see components/ui/Sheet.tsx).
 */
export function LenisProvider({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotionPref();
  if (reduced) return <>{children}</>;
  return (
    <ReactLenis root options={{ lerp: 0.12, smoothWheel: true }}>
      <LenisResizeWatcher />
      {children}
    </ReactLenis>
  );
}

/**
 * Re-measure Lenis whenever the page content grows. Lenis's own autoResize
 * observes `document.documentElement`, whose box stays viewport-height even as
 * its scrollHeight grows — so it misses content appended by infinite-scroll
 * lists (and late-loading images), leaving a stale max-scroll that makes
 * scrolling stick/stutter. `document.body` DOES grow with content, so observing
 * it and calling `lenis.resize()` keeps the scroll bounds correct.
 */
function LenisResizeWatcher() {
  const lenis = useLenis();
  useEffect(() => {
    if (!lenis || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => lenis.resize());
    });
    ro.observe(document.body);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [lenis]);
  return null;
}
