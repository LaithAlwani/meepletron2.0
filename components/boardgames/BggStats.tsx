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

      {bgg.playerPoll && bgg.playerPoll.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-muted">Community player-count poll</p>
          <div className="flex flex-wrap gap-2">
            {bgg.playerPoll.map((p) => {
              const votes = p.best + p.recommended + p.notRecommended;
              const rec = votes
                ? Math.round(((p.best + p.recommended) / votes) * 100)
                : 0;
              const isBest =
                p.best > 0 &&
                p.best >= p.recommended &&
                p.best >= p.notRecommended;
              return (
                <div
                  key={p.count}
                  className={`rounded-xl border px-3 py-2 text-center ${
                    isBest
                      ? "border-accent bg-accent/10"
                      : "border-border bg-surface"
                  }`}
                >
                  <div className="text-sm font-bold text-foreground">
                    {p.count}
                  </div>
                  <div className="text-[10px] text-muted">{rec}% rec</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
