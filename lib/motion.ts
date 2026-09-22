import type { Variants } from "motion/react";

/**
 * Shared motion tokens so every Framer Motion animation reads from one place and
 * matches the app's CSS system (the `.animate-in` keyframe uses this same easing).
 */

/** The app's signature easing — matches the CSS `cubic-bezier(0.22,1,0.36,1)`. */
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const DURATION = { fast: 0.2, base: 0.35, slow: 0.5 } as const;

/** Fade + rise entrance — the workhorse (mirrors the CSS `fade-up`). */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE },
  },
};

/** Container that reveals its children in sequence. Pair with `staggerItem`. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } },
};

export const staggerItem: Variants = fadeUp;

/** Viewport config for scroll reveals: fire once, a touch before fully in view. */
export const REVEAL_VIEWPORT = { once: true, margin: "0px 0px -12% 0px" } as const;
