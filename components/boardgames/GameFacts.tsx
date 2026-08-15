"use client";

import { useEffect, useRef, useState } from "react";
import { Users, Clock, Baby, Brain, UsersRound, Info } from "lucide-react";

type PollEntry = {
  count: number;
  plus?: boolean;
  best: number;
  recommended: number;
  notRecommended: number;
};
type Verdict = "best" | "rec" | "not" | "none";
type Scored = PollEntry & { verdict: Verdict };

export type FactsBgg = {
  weight?: number;
  pollVotes?: number;
  playerPoll?: PollEntry[];
  communityAge?: number;
} | null;

/** A player count's verdict from its own votes (see BGG poll semantics). */
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

const pillCls =
  "inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm";

function Pill({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={pillCls} title={title}>
      <span className="text-accent">{icon}</span>
      {children}
    </span>
  );
}

/** The vote-breakdown panel that opens from the players pill. */
function PollPopover({
  poll,
  pollVotes,
}: {
  poll: Scored[];
  pollVotes?: number;
}) {
  return (
    <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border border-border bg-surface p-3 text-left shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">
          Best player count
        </p>
        {pollVotes != null && (
          <p className="text-[10px] text-muted">
            {pollVotes.toLocaleString()} votes
          </p>
        )}
      </div>
      <div className="space-y-1">
        {poll.map((p) => {
          const total = p.best + p.recommended + p.notRecommended;
          const pct = (n: number) => `${(n / total) * 100}%`;
          return (
            <div key={countLabel(p)} className="flex items-center gap-2">
              <div
                className={`w-6 shrink-0 text-right text-xs tabular-nums ${
                  p.verdict === "best"
                    ? "font-bold text-accent"
                    : "font-medium text-foreground"
                }`}
              >
                {countLabel(p)}
              </div>
              <div
                className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2"
                title={`Best ${p.best} · Recommended ${p.recommended} · Not recommended ${p.notRecommended}`}
              >
                <div className="bg-accent" style={{ width: pct(p.best) }} />
                <div
                  className="bg-accent/40"
                  style={{ width: pct(p.recommended) }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-accent" /> Best
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-accent/40" /> Rec.
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-surface-2" /> Not rec.
        </span>
      </div>
    </div>
  );
}

/** Players pill: count range + "Best N", with the poll breakdown on the info tap. */
function PlayersPill({
  players,
  bestLabel,
  poll,
  pollVotes,
}: {
  players: string;
  bestLabel: string;
  poll: Scored[];
  pollVotes?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  const hasPoll = poll.length > 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => hasPoll && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className={pillCls}>
        <span className="text-accent">
          <Users className="h-4 w-4" />
        </span>
        {players}
        {bestLabel && (
          <>
            <span className="text-subtle">·</span>
            <span className="text-accent">Best {bestLabel}</span>
          </>
        )}
        {hasPoll && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label="Player-count vote breakdown"
            className="ml-0.5 text-subtle transition-colors hover:text-accent"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
      {open && hasPoll && <PollPopover poll={poll} pollVotes={pollVotes} />}
    </span>
  );
}

/**
 * The at-a-glance facts row: players (with the best-count poll), play time,
 * complexity (brain), publisher age, and the community-suggested age.
 */
export function GameFacts({
  players,
  playTime,
  minAge,
  bgg,
}: {
  players: string | null;
  playTime: string | null;
  minAge?: string;
  bgg?: FactsBgg;
}) {
  const poll: Scored[] = (bgg?.playerPoll ?? [])
    .filter((p) => p.best + p.recommended + p.notRecommended > 0)
    .sort((a, b) => a.count - b.count)
    .map((p) => ({ ...p, verdict: verdictOf(p) }));
  const bestLabel = rangeLabel(poll.filter((p) => p.verdict === "best"));
  const weight = bgg?.weight;
  const communityAge = bgg?.communityAge;

  if (!players && !playTime && weight == null && !minAge && communityAge == null)
    return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {players && (
        <PlayersPill
          players={players}
          bestLabel={bestLabel}
          poll={poll}
          pollVotes={bgg?.pollVotes}
        />
      )}
      {playTime && <Pill icon={<Clock className="h-4 w-4" />}>{playTime}</Pill>}
      {weight != null && (
        <Pill
          icon={<Brain className="h-4 w-4" />}
          title={`Complexity ${weight.toFixed(1)} / 5 (BGG weight)`}
        >
          {weight.toFixed(1)}
          <span className="font-normal text-subtle"> / 5</span>
        </Pill>
      )}
      {minAge && <Pill icon={<Baby className="h-4 w-4" />}>Age {minAge}+</Pill>}
      {communityAge != null && (
        <Pill
          icon={<UsersRound className="h-4 w-4" />}
          title="Community-suggested minimum age"
        >
          Community {communityAge}+
        </Pill>
      )}
    </div>
  );
}
