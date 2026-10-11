"use client";

import { useEffect, useState } from "react";

/**
 * True when reduced motion is wanted — via the OS setting
 * (`prefers-reduced-motion`) OR the app's per-user "Reduce motion" toggle
 * (`components/PreferencesEffects.tsx` sets `html.reduce-motion`).
 *
 * The CSS gates in globals.css neutralize CSS animations/transitions, but they
 * DON'T reach requestAnimationFrame-based JS (Framer Motion / GSAP / Lenis /
 * R3F). Every JS animation must gate on this hook so the per-user toggle works.
 */
export function useReducedMotionPref(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const compute = () =>
      setReduced(mq.matches || root.classList.contains("reduce-motion"));

    compute();
    mq.addEventListener("change", compute);
    const obs = new MutationObserver(compute);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      mq.removeEventListener("change", compute);
      obs.disconnect();
    };
  }, []);

  return reduced;
}
