"use client";

import { useEffect, useState } from "react";

/**
 * Track a CSS media query. Reads synchronously on the client's first render so
 * there's no wrong-branch flash (sheets open on interaction, so no SSR paint).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
