"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

/**
 * Animates every route change with the browser's View Transitions API via
 * React's `<ViewTransition>` (enabled in next.config.ts). Keyed on the pathname
 * so the old page gets an `exit` snapshot and the new one an `enter`.
 *
 * Untyped navigations (any Link / router.push) get a quick fade-out and a
 * fade+rise in — the same feel as the previous Framer version. Links that opt
 * in with `transitionTypes={["nav-forward"]}` / `["nav-back"]` slide the
 * content left/right instead. The CSS for each class lives in
 * app/globals.css under "View transitions"; the header, mobile top bar and
 * bottom nav are pinned there so only the page body moves. Reduced motion
 * (OS or the in-app toggle) zeroes the durations.
 */
const TRANSITIONS = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  default: "page",
} as const;

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition
      key={pathname}
      enter={TRANSITIONS}
      exit={TRANSITIONS}
      default="none"
    >
      <div>{children}</div>
    </ViewTransition>
  );
}
