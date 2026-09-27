/**
 * Shared game-card layout primitives, so the grid/rail shape and their loading
 * skeletons stay in lockstep across the library, collection, and lists.
 * Covers are square "shelf" tiles (see GameCard).
 */

/** Responsive shelf-cover grid used by the library + collection grids. */
export const CARD_GRID =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5";

/** Fixed-width cell for a horizontal shelf-cover rail. */
export const RAIL_CELL = "w-32 shrink-0 snap-start sm:w-36";

/** Loading placeholder that matches {@link CARD_GRID}. */
export function GameGridSkeleton({ count = 16 }: { count?: number }) {
  return (
    <div className={CARD_GRID}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="aspect-square animate-pulse rounded-lg bg-surface-2"
        />
      ))}
    </div>
  );
}

/** A horizontal rail of loading cells (matches a CardRail of {@link RAIL_CELL} cards). */
export function RailSkeletonCells({ count = 6 }: { count?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${RAIL_CELL} aspect-square animate-pulse rounded-lg bg-surface-2`}
        />
      ))}
    </div>
  );
}
