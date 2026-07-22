/**
 * Coerce a value to a finite number, defaulting to 0. Guards token/cost math
 * against NaN/Infinity/undefined — a single NaN summed into a running total
 * poisons it permanently (and NaN passes Convex's `v.number()` validator).
 */
export function finite(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}
