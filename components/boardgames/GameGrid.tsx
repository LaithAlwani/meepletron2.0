/**
 * Shared game-card layout primitives, so the grid/rail shape and their loading
 * skeletons stay in lockstep across the library, collection, and lists.
 */

/** Responsive card grid used by the full library + collection grids. */
export const CARD_GRID = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";

/** Fixed-width cell for a horizontal game-card rail. */
export const RAIL_CELL = "w-40 shrink-0 snap-start sm:w-44";

/** Loading placeholder that matches {@link CARD_GRID}. */
export function GameGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={CARD_GRID}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="aspect-4/3 animate-pulse rounded-2xl bg-surface-2"
        />
      ))}
    </div>
  );
}

/** A horizontal rail of loading cells (matches a CardRail of {@link RAIL_CELL} cards). */
export function RailSkeletonCells({ count = 6 }: { count?: number }) {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${RAIL_CELL} aspect-4/3 animate-pulse rounded-2xl bg-surface-2`}
        />
      ))}
    </div>
  );
}
