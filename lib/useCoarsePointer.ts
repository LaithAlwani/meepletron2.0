"use client";

import { useEffect, useState } from "react";

/**
 * Whether the primary pointer is "coarse" (touch — phones & tablets) rather than
 * "fine" (mouse/trackpad — desktop). Returns `null` until mounted so SSR / first
 * paint can render a device-agnostic default and avoid a hydration mismatch.
 */
export function useCoarsePointer(): boolean | null {
  const [coarse, setCoarse] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = () => setCoarse(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return coarse;
}
