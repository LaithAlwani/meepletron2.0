/**
 * The BGG rating as a bold number inside an accent hexagon — sits just before
 * the game title in the detail hero. Hidden by the caller when there's no rating.
 */
export function HexRating({
  value,
  count,
}: {
  value: number;
  count?: number;
}) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center bg-accent text-accent-foreground shadow-sm"
      style={{
        width: 56,
        height: 62,
        clipPath:
          "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
      }}
      title={`BoardGameGeek rating ${value.toFixed(1)} / 10${
        count != null ? ` · ${count.toLocaleString()} ratings` : ""
      }`}
      aria-label={`BoardGameGeek rating ${value.toFixed(1)} out of 10`}
    >
      <span className="text-xl font-extrabold leading-none tabular-nums">
        {value.toFixed(1)}
      </span>
    </span>
  );
}
