"use client";

import { MotionConfig } from "motion/react";
import { EASE } from "@/lib/motion";
import { useReducedMotionPref } from "@/components/lib/useReducedMotionPref";

/**
 * App-wide Framer Motion config. Sets a default easing so motion reads consistent
 * with the CSS system, and honors reduced motion from BOTH sources: the OS
 * (`reducedMotion="user"`) and the per-user toggle — when `html.reduce-motion`
 * is set we force `"always"`, which strips transform/layout animation everywhere.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotionPref();
  return (
    <MotionConfig
      reducedMotion={reduced ? "always" : "user"}
      transition={{ ease: EASE }}
    >
      {children}
    </MotionConfig>
  );
}
