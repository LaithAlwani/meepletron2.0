"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Die } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export type CoverItem = {
  key: string;
  title: string;
  thumbUrl: string | null;
  href?: string;
};

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
        // Desktop only — touch users swipe.
        "absolute top-12 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface/90 text-muted shadow-md backdrop-blur transition-opacity hover:text-foreground sm:flex",
        dir === "left" ? "-left-1" : "-right-1",
        disabled && "pointer-events-none opacity-0",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

/**
 * A horizontal, edge-bleeding strip of square game covers with a hidden
 * scrollbar and desktop-only scroll arrows (fading out at the ends). `trailing`
 * appends an extra tile (e.g. a "+N more" link).
 */
export function CoverScroller({
  items,
  trailing,
}: {
  items: CoverItem[];
  trailing?: ReactNode;
}) {
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
  }, [update, items.length]);

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
        className="-mx-4 overflow-x-auto px-4 pb-2 [&::-webkit-scrollbar]:hidden"
      >
        <ul className="flex gap-3">
          {items.map((g) => {
            const tile = (
              <>
                <div className="aspect-square w-24 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border">
                  {g.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={g.thumbUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-subtle">
                      <Die className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <p className="mt-1 w-24 truncate text-[11px] text-muted">
                  {g.title}
                </p>
              </>
            );
            return (
              <li key={g.key} className="shrink-0">
                {g.href ? (
                  <Link href={g.href} className="group block">
                    {tile}
                  </Link>
                ) : (
                  <div>{tile}</div>
                )}
              </li>
            );
          })}
          {trailing}
        </ul>
      </div>

      <Arrow dir="left" onClick={() => nudge(-1)} disabled={atStart} />
      <Arrow dir="right" onClick={() => nudge(1)} disabled={atEnd} />
    </div>
  );
}
