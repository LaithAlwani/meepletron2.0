"use client";

type PollEntry = {
  count: number;
  plus?: boolean;
  best: number;
  recommended: number;
  notRecommended: number;
};

type Bgg = {
  rating?: number;
  ratingCount?: number;
  weight?: number;
  pollVotes?: number;
  playerPoll?: PollEntry[];
} | null;

type Verdict = "best" | "rec" | "not" | "none";

/**
 * A player count's verdict from ITS OWN votes (not a global winner-take-all):
 * "best" when Best is the count's top bucket → naturally yields ranges (3–4);
 * "rec" when Best + Recommended still outweigh Not-Recommended; else "not".
 */
function verdictOf(p: PollEntry): Verdict {
  const total = p.best + p.recommended + p.notRecommended;
  if (!total) return "none";
  if (p.best >= p.recommended && p.best >= p.notRecommended) return "best";
  if (p.best + p.recommended > p.notRecommended) return "rec";
  return "not";
}

/** "4" or "6+". */
function countLabel(p: PollEntry): string {
  return `${p.count}${p.plus ? "+" : ""}`;
}

/** Compact contiguous ranges: [2,3,4] → "2–4", [4] → "4", [2,4] → "2, 4". */
function rangeLabel(entries: PollEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.count - b.count);
  const groups: PollEntry[][] = [];
  for (const e of sorted) {
    const last = groups[groups.length - 1];
    if (last && e.count === last[last.length - 1].count + 1) last.push(e);
    else groups.push([e]);
  }
  return groups
    .map((g) =>
      g.length === 1
        ? countLabel(g[0])
        : `${g[0].count}–${countLabel(g[g.length - 1])}`,
    )
    .join(", ");
}

/** BoardGameGeek rating, weight, and player-count poll. Hidden until data exists. */
export function BggStats({ bgg }: { bgg?: Bgg }) {
  if (!bgg || (bgg.rating == null && bgg.weight == null && !bgg.playerPoll)) {
    return null;
  }

  const poll = (bgg.playerPoll ?? [])
    .filter((p) => p.best + p.recommended + p.notRecommended > 0)
    .sort((a, b) => a.count - b.count);

  const withVerdict = poll.map((p) => ({ ...p, verdict: verdictOf(p) }));
  const bestLabel = rangeLabel(withVerdict.filter((p) => p.verdict === "best"));
  const recLabel = rangeLabel(
    withVerdict.filter((p) => p.verdict === "best" || p.verdict === "rec"),
  );
  const lowVotes = bgg.pollVotes != null && bgg.pollVotes < 10;

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

      {withVerdict.length > 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="text-sm font-semibold text-foreground">
              How many players is best
            </p>
            {bgg.pollVotes != null && (
              <p className="text-xs text-muted">
                {bgg.pollVotes.toLocaleString()} community votes
              </p>
            )}
          </div>

          {(bestLabel || recLabel) && (
            <p className="mb-3 text-sm text-muted">
              {bestLabel && (
                <span className="font-semibold text-foreground">
                  Best with {bestLabel}
                </span>
              )}
              {bestLabel && recLabel && recLabel !== bestLabel && " · "}
              {recLabel !== bestLabel && recLabel && <>Recommended {recLabel}</>}
              {lowVotes && (
                <span className="text-subtle">
                  {" "}
                  · few votes, take with a grain of salt
                </span>
              )}
            </p>
          )}

          <div className="space-y-1.5">
            {withVerdict.map((p) => {
              const total = p.best + p.recommended + p.notRecommended;
              const pct = (n: number) => `${(n / total) * 100}%`;
              return (
                <div key={countLabel(p)} className="flex items-center gap-3">
                  <div
                    className={`w-8 shrink-0 text-right text-sm tabular-nums ${
                      p.verdict === "best"
                        ? "font-bold text-accent"
                        : "font-medium text-foreground"
                    }`}
                  >
                    {countLabel(p)}
                  </div>
                  <div
                    className="flex h-3 flex-1 overflow-hidden rounded-full bg-surface-2"
                    title={`${countLabel(p)} player${p.count === 1 && !p.plus ? "" : "s"} — Best ${p.best} · Recommended ${p.recommended} · Not recommended ${p.notRecommended}`}
                  >
                    <div className="bg-accent" style={{ width: pct(p.best) }} />
                    <div
                      className="bg-accent/40"
                      style={{ width: pct(p.recommended) }}
                    />
                    {/* Remaining track = Not recommended */}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-accent" /> Best
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-accent/40" /> Recommended
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-surface-2" /> Not
              recommended
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
