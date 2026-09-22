"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { EASE } from "@/lib/motion";

/**
 * A gentle fade+rise on every route change. Enter-only (keyed on the pathname so
 * it remounts + replays) — no exit animation, which keeps App Router navigation
 * snappy and avoids fighting Next's rendering. Reduced motion → instant (Framer
 * strips the transform via MotionConfig).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
