"use client";

import type { GameSortKey } from "@/convex/lib/gameSort";
import { cn } from "@/lib/cn";
import type { LibraryFilterState } from "./useLibraryFilters";
import { ChatReadyToggle } from "./ChatReadyToggle";
import { SortControl } from "./SortControl";
import { FilterButton } from "./FilterButton";

/**
 * The right-aligned library toolbar cluster — chat-ready toggle, sort, and the
 * filters button — shared by /boardgames and /boardgames/all. `trailing` adds a
 * page-specific control (e.g. the grid/list view toggle on the full grid).
 * (Search lives in the top nav on these pages; the collection lists keep their
 * own toolbar since they carry a per-list search box.)
 */
export function LibraryControls({
  filters,
  setFilters,
  sort,
  setSort,
  activeCount,
  onOpenFilters,
  trailing,
  className = "mt-2 nav:mt-4",
}: {
  filters: LibraryFilterState;
  setFilters: (f: LibraryFilterState) => void;
  sort: GameSortKey;
  setSort: (s: GameSortKey) => void;
  activeCount: number;
  onOpenFilters: () => void;
  trailing?: React.ReactNode;
  /** Margin/positioning for the wrapper (the trio + gap are fixed). */
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-end gap-2", className)}>
      <ChatReadyToggle
        active={filters.chatOnly}
        onToggle={() => setFilters({ ...filters, chatOnly: !filters.chatOnly })}
      />
      <SortControl
        value={sort}
        onChange={setSort}
        className="flex-1 sm:w-40 sm:flex-none"
      />
      <FilterButton activeCount={activeCount} onClick={onOpenFilters} />
      {trailing}
    </div>
  );
}
