/** Tiny classnames joiner (truthy parts joined by spaces). */
export function cn(
  ...parts: (string | false | null | undefined)[]
): string {
  return parts.filter(Boolean).join(" ");
}
