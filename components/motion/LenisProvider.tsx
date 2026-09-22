"use client";

import { ReactLenis } from "lenis/react";
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
      {children}
    </ReactLenis>
  );
}
