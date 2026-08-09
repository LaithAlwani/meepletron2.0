import type { LucideProps } from "lucide-react";

/**
 * Brand glyphs (meeple + die) that match lucide's stroke-icon API, so they mix
 * cleanly with `lucide-react` icons used elsewhere. Import lucide icons directly
 * where needed; these two live here because lucide has no meeple.
 */

/** The classic board-game meeple silhouette. */
export function Meeple({ size = 24, className, ...props }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
      {...props}
    >
      <path d="M12 2a2.6 2.6 0 0 0-1.5 4.72L8.4 9H4.3a1.3 1.3 0 0 0-1.15 1.9l1.9 3.63-.93 6.02A1.2 1.2 0 0 0 5.3 22h2.5a1 1 0 0 0 .98-.8l.83-4.2h4.78l.83 4.2a1 1 0 0 0 .98.8h2.5a1.2 1.2 0 0 0 1.18-1.43l-.93-6.02 1.9-3.63A1.3 1.3 0 0 0 19.7 9h-4.1l-2.1-2.28A2.6 2.6 0 0 0 12 2Z" />
    </svg>
  );
}

/** A die with five pips (brand mark). */
export function Die({ size = 24, className, strokeWidth = 2, ...props }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
