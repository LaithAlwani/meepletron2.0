/** Day separator label: Today, Yesterday, a weekday (last 7 days), else a date. */
export function dayLabel(ts: number): string {
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const d = new Date(ts);
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Short relative time: "just now", "5m ago", "3h ago", "2d ago", else a date. */
export function relativeTime(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day <= 7) return `${day}d ago`;
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/** Format a min/max play time as "60–90 min", "45 min", or null. */
export function formatPlayTime(min?: number, max?: number): string | null {
  if (min && max) return min === max ? `${min} min` : `${min}–${max} min`;
  const single = min ?? max;
  return single ? `${single} min` : null;
}
