"use client";

import type { CSSProperties } from "react";
import { useParallax } from "@/components/motion/useParallax";

// Floating game-piece emojis behind the hero (CSS-only, gated by reduced motion).
const PIECES: { emoji: string; className: string; style: CSSProperties }[] = [
  { emoji: "🎲", className: "left-[7%] top-[14%] text-5xl", style: { ["--r"]: "-12deg", ["--float-dur"]: "6s", animationDelay: "0s" } as CSSProperties },
  { emoji: "🧩", className: "right-[9%] top-[20%] text-4xl", style: { ["--r"]: "10deg", ["--float-dur"]: "7s", animationDelay: "0.6s" } as CSSProperties },
  { emoji: "♟️", className: "left-[12%] bottom-[24%] text-4xl", style: { ["--r"]: "6deg", ["--float-dur"]: "5.5s", animationDelay: "1.1s" } as CSSProperties },
  { emoji: "🃏", className: "right-[12%] bottom-[28%] text-5xl", style: { ["--r"]: "-8deg", ["--float-dur"]: "6.5s", animationDelay: "0.3s" } as CSSProperties },
];

/**
 * The hero backdrop: an always-on aurora glow (with a gentle scroll parallax)
 * plus floating game-piece emojis. Reduced motion stills everything via the
 * CSS gates in globals.css and the parallax hook.
 */
export function HeroBackdrop() {
  // Depth parallax: the two glows drift at different rates as the hero scrolls.
  const auroraA = useParallax<HTMLDivElement>(120);
  const auroraB = useParallax<HTMLDivElement>(-180);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* Parallax on the wrapper (GSAP owns its transform); the drift keyframe
          stays on the inner blob so the two transforms never collide. */}
      <div ref={auroraA} className="absolute -left-24 top-[-10%]">
        <div
          className="aurora h-80 w-80 rounded-full bg-accent/20 blur-3xl"
          style={{ ["--aurora-dur"]: "20s" } as CSSProperties}
        />
      </div>
      <div ref={auroraB} className="absolute -right-24 top-1/4">
        <div
          className="aurora h-96 w-96 rounded-full bg-accent/15 blur-3xl"
          style={{ ["--aurora-dur"]: "26s", animationDelay: "3s" } as CSSProperties}
        />
      </div>
      {PIECES.map((p, i) => (
        <span
          key={i}
          className={`float pointer-events-none absolute hidden select-none opacity-20 blur-[1px] sm:block ${p.className}`}
          style={p.style}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
