"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

function Arrow({
  dir,
  onClick,
  disabled,
}: {
  dir: "left" | "right";
  onClick: () => void;
  disabled: boolean;
}) {
  const Icon = dir === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={dir === "left" ? "Scroll left" : "Scroll right"}
      onClick={onClick}
      className={cn(
        // Desktop only — touch users swipe. Aligned to the card cover's centre.
        "absolute top-[4.5rem] z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface/90 text-muted shadow-md backdrop-blur transition-opacity hover:text-foreground sm:flex",
        dir === "left" ? "-left-1" : "-right-1",
        disabled && "pointer-events-none opacity-0",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

/**
 * A horizontal, edge-bleeding rail of full game cards with a hidden scrollbar and
 * desktop-only scroll arrows (fading out at the ends). Children are the `<li>`
 * cells. Mirrors CoverScroller but sized for the library GameCard.
 */
export function CardRail({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  function nudge(dir: number) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={update}
        style={{ scrollbarWidth: "none" }}
        className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        <ul className="flex snap-x gap-4">{children}</ul>
      </div>

      <Arrow dir="left" onClick={() => nudge(-1)} disabled={atStart} />
      <Arrow dir="right" onClick={() => nudge(1)} disabled={atEnd} />
    </div>
  );
}
