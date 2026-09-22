"use client";

import { SearchTermChip } from "./SearchTermChip";

/**
 * The row beneath the toolbar that surfaces what's narrowing the page — the
 * active `?q=` search term (which otherwise lives only in the URL) and a
 * clear-all-filters link. Renders nothing when neither is active.
 */
export function ActiveFilterBar({
  term,
  activeCount,
  onClear,
}: {
  term: string;
  activeCount: number;
  onClear: () => void;
}) {
  if (!term && activeCount === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <SearchTermChip term={term} />
      {activeCount > 0 && (
        <button
          onClick={onClear}
          className="text-sm font-semibold text-accent hover:underline"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}
