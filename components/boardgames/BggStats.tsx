"use client";

type Bgg = {
  rating?: number;
  ratingCount?: number;
  weight?: number;
  playerPoll?: {
    count: number;
    best: number;
    recommended: number;
    notRecommended: number;
  }[];
} | null;

/** BoardGameGeek rating, weight, and player-count poll. Hidden until data exists. */
export function BggStats({ bgg }: { bgg?: Bgg }) {
  if (!bgg || (bgg.rating == null && bgg.weight == null && !bgg.playerPoll)) {
    return null;
  }

  // The poll stores vote COUNTS per player count. BGG's convention: the count(s)
  // with the most "Best" votes are "Best"; a count is "Recommended" when
  // best + recommended outweigh not-recommended; otherwise it's not recommended.
  const poll = (bgg.playerPoll ?? []).filter(
    (p) => p.best + p.recommended + p.notRecommended > 0,
  );
  const maxBest = Math.max(0, ...poll.map((p) => p.best));
  const verdictOf = (p: { best: number; recommended: number; notRecommended: number }) =>
    p.best === maxBest && maxBest > 0
      ? "best"
      : p.best + p.recommended > p.notRecommended
        ? "rec"
        : "not";
  const VERDICT = {
    best: { label: "Best", cls: "border-accent bg-accent/10 text-foreground" },
    rec: { label: "Good", cls: "border-border bg-surface text-foreground" },
    not: { label: "Not ideal", cls: "border-border bg-surface-2 text-subtle" },
  } as const;

  return (
    <section className="animate-in mb-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Ratings &amp; weight
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {bgg.rating != null && (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-extrabold text-foreground">
                {bgg.rating.toFixed(1)}
              </span>
              <span className="text-xs text-muted">/ 10</span>
            </div>
            <div className="mt-1 text-xs text-muted">
              BGG rating
              {bgg.ratingCount != null
                ? ` · ${bgg.ratingCount.toLocaleString()} ratings`
                : ""}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.min(100, bgg.rating * 10)}%` }}
              />
            </div>
          </div>
        )}
        {bgg.weight != null && (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-extrabold text-foreground">
                {bgg.weight.toFixed(1)}
              </span>
              <span className="text-xs text-muted">/ 5</span>
            </div>
            <div className="mt-1 text-xs text-muted">Complexity / weight</div>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${
                    i <= Math.round(bgg.weight!) ? "bg-accent" : "bg-surface-2"
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {poll.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-muted">
            How many players plays best — BGG community poll
          </p>
          <div className="flex flex-wrap gap-2">
            {poll.map((p) => {
              const v = VERDICT[verdictOf(p)];
              return (
                <div
                  key={p.count}
                  title={`${p.count} player${p.count === 1 ? "" : "s"} — Best ${p.best} · Recommended ${p.recommended} · Not recommended ${p.notRecommended}`}
                  className={`min-w-14 rounded-xl border px-3 py-2 text-center ${v.cls}`}
                >
                  <div className="text-sm font-bold">{p.count}</div>
                  <div className="text-[10px] font-medium">{v.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
