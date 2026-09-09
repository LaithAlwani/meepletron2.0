"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { registerNavigation } from "@/components/lib/navHistory";

/**
 * Counts in-app client navigations (route changes after the initial load) so
 * `BackButton` / `useBackNav` know whether a browser Back stays inside the app.
 * Rendered once in the root layout.
 */
export function NavigationTracker() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false; // skip the initial mount — that's the entry page
      return;
    }
    registerNavigation();
  }, [pathname]);
  return null;
}
