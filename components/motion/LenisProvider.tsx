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
 * Re-measure Lenis whenever the page content grows — content appended by
 * infinite-scroll lists, and images that land after first paint, both change
 * the page height without a window resize, and a stale max-scroll makes
 * scrolling stick or stutter.
 *
 * Belt-and-braces alongside Lenis's own autoResize (which observes
 * documentElement, now that `lenis.css` lets that box grow with the content).
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
