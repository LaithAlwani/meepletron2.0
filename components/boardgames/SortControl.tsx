"use client";

import { SelectMenu } from "@/components/ui/SelectMenu";
import { GAME_SORTS, type GameSortKey } from "@/convex/lib/gameSort";

const OPTIONS = GAME_SORTS.map((s) => ({ value: s.key, label: s.label }));

/** The shared "Sort by" dropdown for every game list (library, collection, …). */
export function SortControl({
  value,
  onChange,
  className,
}: {
  value: GameSortKey;
  onChange: (v: GameSortKey) => void;
  className?: string;
}) {
  return (
    <SelectMenu
      value={value}
      onChange={onChange}
      aria-label="Sort games"
      className={className}
      options={OPTIONS}
    />
  );
}
