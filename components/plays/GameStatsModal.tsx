"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { X, Loader2, Dices, Trophy } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Thumb } from "@/components/top-games/Thumb";
import { playDate } from "@/components/plays/PlayCard";
import { Sheet } from "@/components/ui/Sheet";

// Chart.js is heavy — load it only when the drill-down actually opens.
const GameStatsCharts = dynamic(
  () => import("./GameStatsCharts").then((m) => m.GameStatsCharts),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-40 items-center justify-center text-subtle">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    ),
  },
);

export function GameStatsModal({
  open,
  gameId,
  title,
  onClose,
}: {
  open: boolean;
  gameId: Id<"games"> | null;
  title: string;
  onClose: () => void;
}) {
  const data = useQuery(api.plays.gameDetailStats, {
    gameId: gameId ?? undefined,
    title,
  });

  const header = (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-2">
        {data?.coverUrl ? (
          <Thumb url={data.coverUrl} className="h-10 w-10" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-subtle">
            <Dices className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display truncate text-lg font-extrabold leading-tight">
          {data?.title ?? title}
        </p>
        {data?.slug && (
          <Link
            href={`/boardgames/${data.slug}`}
            className="text-xs font-semibold text-accent hover:underline"
          >
            View game
          </Link>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
      >
        <X className="h-4.5 w-4.5" />
      </button>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} desktop="center" desktopWidth="sm:max-w-2xl">
      {header}
      <div className="themed-scroll flex-1 overflow-y-auto overflow-x-hidden p-4">
          {data === undefined ? (
            <div className="flex h-48 items-center justify-center text-subtle">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : data === null ? (
            <p className="py-12 text-center text-sm text-muted">
              No plays recorded for this game yet.
            </p>
          ) : (
            <>
              {/* Summary tiles */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label="Plays" value={data.totals.plays} />
                <Tile
                  label="Win rate"
                  value={
                    data.totals.winPct === null ? "—" : `${data.totals.winPct}%`
                  }
                  sub={
                    data.totals.decided > 0
                      ? `${data.totals.wins}/${data.totals.decided}`
                      : undefined
                  }
                />
                <Tile label="Best score" value={data.totals.bestScore ?? "—"} />
                <Tile label="Avg score" value={data.totals.avgScore ?? "—"} />
              </div>
              <p className="mb-4 text-xs text-subtle">
                First played {playDate(data.totals.firstPlayed)} · last{" "}
                {playDate(data.totals.lastPlayed)}
              </p>

              <GameStatsCharts data={data} />

              {/* Recent plays */}
              {data.recent.length > 0 && (
                <div className="mt-4 rounded-2xl border border-border-muted bg-surface p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-subtle">
                    Recent plays
                  </p>
                  <ul className="divide-y divide-border-muted">
                    {data.recent.map((r) => (
                      <li
                        key={r.playId}
                        className="flex items-center gap-3 py-2 text-sm"
                      >
                        {r.isWinner ? (
                          <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-accent-2/12 px-2 text-[11px] font-bold text-accent-2">
                            <Trophy className="h-3 w-3" />
                            Won
                          </span>
                        ) : r.isWinner === false ? (
                          <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-surface-2 px-2 text-[11px] font-semibold text-subtle">
                            Lost
                          </span>
                        ) : (
                          <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-surface-2 px-2 text-[11px] font-semibold text-subtle">
                            —
                          </span>
                        )}
                        <span className="w-16 shrink-0 text-xs text-subtle">
                          {playDate(r.date)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted">
                          {r.opponents.length > 0
                            ? `vs ${r.opponents.join(", ")}`
                            : "solo"}
                        </span>
                        {r.score !== null && (
                          <span className="shrink-0 font-semibold tabular-nums">
                            {r.score}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
      </div>
    </Sheet>
  );
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border-muted bg-surface p-3 text-center">
      <div className="text-2xl font-extrabold tabular-nums text-foreground">
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-subtle">
        {label}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-subtle">{sub}</div>}
    </div>
  );
}
