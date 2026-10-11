"use client";

import { useEffect } from "react";
import { useLenis } from "lenis/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

/**
 * Keeps GSAP ScrollTrigger in sync with Lenis's smoothed scroll position, so any
 * scrubbed effect (see useParallax) tracks the smooth scroll rather than the raw
 * native position. No-op when Lenis isn't running (reduced motion → native
 * scroll, which ScrollTrigger already tracks on its own).
 */
export function GsapLenisBridge() {
  const lenis = useLenis();
  useEffect(() => {
    if (!lenis) return;
    const update = () => ScrollTrigger.update();
    lenis.on("scroll", update);
    ScrollTrigger.refresh();
    return () => lenis.off("scroll", update);
  }, [lenis]);
  return null;
}
