/**
 * The display title for a Top Games list. When the user names the list, the
 * name sits between the size and the year: "Top 10 · 2-player games · 2025".
 * Without a name it's just "Top 10 · 2025".
 */
export function topListTitle(
  size: number,
  year: number,
  name?: string | null,
): string {
  const trimmed = name?.trim();
  return trimmed ? `Top ${size} · ${trimmed} · ${year}` : `Top ${size} · ${year}`;
}
