"use client";

import Link from "next/link";
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Doughnut, Bar } from "react-chartjs-2";
import { Trophy, Dices } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/Surface";
import { playDate } from "@/components/plays/PlayCard";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip);

const ACCENT = "#f0603a";
const TRACK = "rgba(148,163,184,0.22)";
const AXIS = "rgba(148,163,184,0.9)";

type Stats = NonNullable<FunctionReturnType<typeof api.plays.myPlayStats>>;

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short" });
}

/**
 * A player's play summary — win-rate doughnut, a 6-month bar chart, the headline
 * numbers, and the last few games (with winners). Charts via chart.js.
 */
export function PlayerStatsCard({
  stats,
  engagement,
}: {
  stats: Stats | null | undefined;
  engagement?: { likesReceived: number; commentsReceived: number } | null;
}) {
  if (stats === undefined) {
    return <Skeleton className="h-64 w-full rounded-2xl" />;
  }
  if (!stats || stats.total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">
        <Dices className="mx-auto h-8 w-8 text-subtle" />
        <p className="mt-2 font-medium">No plays yet.</p>
        <p className="mt-1 text-sm">Log a game to start building your stats.</p>
      </div>
    );
  }

  const winPct = stats.winPct;
  const losses = Math.max(0, stats.decided - stats.wins);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      {/* Win rate + headline numbers */}
      <div className="flex items-center gap-5">
        <div className="relative h-28 w-28 shrink-0">
          <Doughnut
            data={{
              labels: ["Wins", "Losses"],
              datasets: [
                {
                  data: stats.decided > 0 ? [stats.wins, losses] : [0, 1],
                  backgroundColor: [ACCENT, TRACK],
                  borderWidth: 0,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: "74%",
              plugins: {
                legend: { display: false },
                tooltip: { enabled: stats.decided > 0 },
              },
            }}
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-2xl font-extrabold tabular-nums">
              {winPct != null ? `${winPct}%` : "—"}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
              win rate
            </span>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-3">
          <Stat label="Total plays" value={stats.total} />
          <Stat label="This month" value={stats.thisMonth} />
          <Stat label="Games" value={stats.uniqueGames} />
          <Stat
            label="Record"
            value={stats.decided > 0 ? `${stats.wins}–${losses}` : "—"}
          />
        </div>
      </div>

      {engagement && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stat label="Likes received" value={engagement.likesReceived} />
          <Stat label="Comments received" value={engagement.commentsReceived} />
        </div>
      )}

      {/* Monthly bar chart */}
      <div className="mt-5">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">
          Last 6 months
        </p>
        <div className="h-28">
          <Bar
            data={{
              labels: stats.byMonth.map((m) => monthLabel(m.month)),
              datasets: [
                {
                  data: stats.byMonth.map((m) => m.count),
                  backgroundColor: ACCENT,
                  borderRadius: 6,
                  maxBarThickness: 34,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { enabled: true } },
              scales: {
                x: {
                  grid: { display: false },
                  border: { display: false },
                  ticks: { color: AXIS, font: { size: 11 } },
                },
                y: {
                  display: false,
                  beginAtZero: true,
                  grace: "20%",
                },
              },
            }}
          />
        </div>
      </div>

      {/* Recent games with winners */}
      <div className="mt-4">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">
          Recent games
        </p>
        <ul className="divide-y divide-border-muted">
          {stats.recent.map((r) => (
            <li key={r.playId}>
              <Link
                href={`/plays/${r.playId}`}
                className="flex items-center gap-3 py-2 transition-colors hover:text-accent"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {r.title}
                </span>
                {r.winners.length > 0 && (
                  <span className="inline-flex min-w-0 items-center gap-1 truncate text-xs font-semibold text-accent-2">
                    <Trophy className="h-3 w-3 shrink-0" />
                    {r.winners.slice(0, 2).join(", ")}
                  </span>
                )}
                <span className="shrink-0 text-xs text-subtle">
                  {playDate(r.date)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <div className="font-display text-xl font-extrabold tabular-nums">
        {value}
      </div>
      <div className="text-[11px] text-subtle">{label}</div>
    </div>
  );
}
