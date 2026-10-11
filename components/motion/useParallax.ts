"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useReducedMotionPref } from "@/components/lib/useReducedMotionPref";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

/**
 * Scrubbed vertical parallax via GSAP ScrollTrigger (smoothed through Lenis by
 * GsapLenisBridge). Attach the returned ref to a decorative element that nothing
 * else transforms; it drifts by `distance` px as it travels through the viewport.
 * Off (identity ref) when reduced motion is requested.
 */
export function useParallax<T extends HTMLElement = HTMLDivElement>(distance = 60) {
  const ref = useRef<T>(null);
  const reduced = useReducedMotionPref();

  useGSAP(
    () => {
      const el = ref.current;
      if (reduced || !el) return;
      gsap.fromTo(
        el,
        { y: -distance / 2 },
        {
          y: distance / 2,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        },
      );
    },
    { dependencies: [reduced, distance] },
  );

  return ref;
}
