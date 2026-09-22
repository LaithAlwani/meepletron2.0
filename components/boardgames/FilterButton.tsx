"use client";

import { SlidersHorizontal } from "lucide-react";

/** The square "open filters" button with an active-filter count badge — shared by
 *  every library/collection toolbar. */
export function FilterButton({
  activeCount,
  onClick,
}: {
  activeCount: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label="Filters"
      title="Filters"
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      <SlidersHorizontal className="h-4.5 w-4.5" />
      {activeCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-foreground">
          {activeCount}
        </span>
      )}
    </button>
  );
}
