"use client";

import { useMemo } from "react";
import type { FunctionReturnType } from "convex/server";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Filler,
} from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import type { api } from "@/convex/_generated/api";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Filler,
);

type Detail = NonNullable<FunctionReturnType<typeof api.plays.gameDetailStats>>;

/** Read the live theme's colors so charts match light/dark automatically. */
function themeColors() {
  const s = getComputedStyle(document.documentElement);
  const read = (name: string, fb: string) =>
    s.getPropertyValue(name).trim() || fb;
  return {
    accent: read("--accent", "#dc4e26"),
    accent2: read("--accent-2", "#0d8f80"),
    muted: read("--muted", "#6a6155"),
    subtle: read("--subtle", "#9c9284"),
    border: read("--border", "#e8dfd0"),
    surface2: read("--surface-2", "#f3ece0"),
  };
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h.split("").map((c) => c + c).join("")
      : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, (mo ?? 1) - 1, 1).toLocaleDateString("en-US", {
    month: "short",
  });
};
const dayLabel = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

function ChartCard({
  title,
  children,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-2xl border border-border-muted bg-surface p-4 ${wide ? "sm:col-span-2" : ""}`}
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-subtle">
        {title}
      </p>
      <div className="relative w-full">{children}</div>
    </div>
  );
}

export function GameStatsCharts({ data }: { data: Detail }) {
  const c = useMemo(() => themeColors(), []);

  const axis = useMemo(
    () => ({
      grid: { color: hexToRgba(c.subtle, 0.14), drawTicks: false },
      border: { display: false },
      ticks: { color: c.muted, font: { size: 11 } },
    }),
    [c],
  );

  const baseOpts = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.surface2,
          titleColor: c.muted,
          bodyColor: c.muted,
          borderColor: hexToRgba(c.subtle, 0.3),
          borderWidth: 1,
          padding: 10,
          displayColors: false,
        },
      },
      animation: { duration: 700, easing: "easeOutQuart" as const },
    }),
    [c],
  );

  const hasTrend = data.scoreHistory.length >= 2;
  const hasMonths = data.playsByMonth.length >= 2;
  const hasWinLoss = data.totals.decided > 0;
  const hasCoPlayers = data.topCoPlayers.length >= 1;

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      {hasTrend && (
        <ChartCard title="Score over time" wide>
          <div className="h-56">
            <Line
              data={{
                labels: data.scoreHistory.map((p) => dayLabel(p.date)),
                datasets: [
                  {
                    data: data.scoreHistory.map((p) => p.score),
                    borderColor: c.accent,
                    backgroundColor: hexToRgba(c.accent, 0.12),
                    borderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: c.accent,
                    tension: 0.35,
                    fill: true,
                  },
                ],
              }}
              options={{
                ...baseOpts,
                scales: {
                  x: {
                    ...axis,
                    ticks: {
                      ...axis.ticks,
                      autoSkip: true,
                      maxTicksLimit: 6,
                      maxRotation: 0,
                      minRotation: 0,
                    },
                  },
                  y: { ...axis, beginAtZero: false },
                },
              }}
            />
          </div>
        </ChartCard>
      )}

      {hasWinLoss && (
        <ChartCard title="Win / loss">
          <div className="relative mx-auto h-56 max-w-64">
            <Doughnut
              data={{
                labels: ["Wins", "Losses"],
                datasets: [
                  {
                    data: [
                      data.totals.wins,
                      data.totals.decided - data.totals.wins,
                    ],
                    backgroundColor: [c.accent2, hexToRgba(c.subtle, 0.28)],
                    borderColor: "transparent",
                    borderRadius: 4,
                    hoverOffset: 4,
                  },
                ],
              }}
              options={{
                ...baseOpts,
                cutout: "70%",
              }}
            />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold text-foreground">
                {data.totals.winPct ?? 0}%
              </span>
              <span className="text-xs text-subtle">win rate</span>
            </div>
          </div>
          <div className="mt-3 flex justify-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: c.accent2 }}
              />
              {data.totals.wins} won
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: hexToRgba(c.subtle, 0.4) }}
              />
              {data.totals.decided - data.totals.wins} lost
            </span>
          </div>
        </ChartCard>
      )}

      {hasMonths && (
        <ChartCard title="Plays by month" wide={!hasWinLoss}>
          <div className="h-56">
            <Bar
              data={{
                labels: data.playsByMonth.map((m) => monthLabel(m.month)),
                datasets: [
                  {
                    data: data.playsByMonth.map((m) => m.count),
                    backgroundColor: hexToRgba(c.accent, 0.85),
                    hoverBackgroundColor: c.accent,
                    borderRadius: 4,
                    maxBarThickness: 34,
                  },
                ],
              }}
              options={{
                ...baseOpts,
                scales: {
                  x: {
                    ...axis,
                    grid: { display: false },
                    ticks: {
                      ...axis.ticks,
                      autoSkip: true,
                      maxTicksLimit: 8,
                      maxRotation: 0,
                    },
                  },
                  y: {
                    ...axis,
                    beginAtZero: true,
                    ticks: { ...axis.ticks, precision: 0 },
                  },
                },
              }}
            />
          </div>
        </ChartCard>
      )}

      {hasCoPlayers && (
        <ChartCard title="Most-played with" wide>
          <div style={{ height: `${Math.max(data.topCoPlayers.length * 34, 88)}px` }}>
            <Bar
              data={{
                labels: data.topCoPlayers.map((p) =>
                  p.name.length > 14 ? `${p.name.slice(0, 13)}…` : p.name,
                ),
                datasets: [
                  {
                    data: data.topCoPlayers.map((p) => p.plays),
                    backgroundColor: hexToRgba(c.accent2, 0.85),
                    hoverBackgroundColor: c.accent2,
                    borderRadius: 4,
                    maxBarThickness: 22,
                  },
                ],
              }}
              options={{
                ...baseOpts,
                indexAxis: "y" as const,
                scales: {
                  x: {
                    ...axis,
                    beginAtZero: true,
                    ticks: { ...axis.ticks, precision: 0 },
                  },
                  y: { ...axis, grid: { display: false } },
                },
              }}
            />
          </div>
        </ChartCard>
      )}
    </div>
  );
}

export default GameStatsCharts;
