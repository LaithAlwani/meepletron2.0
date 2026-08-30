"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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

/** Renders its children only once it scrolls into view, so a below-the-fold
 *  chart animates when the user reaches it rather than silently on load. */
function InView({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);
  return (
    <div ref={ref} className={className}>
      {shown ? children : null}
    </div>
  );
}

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
          <InView className="relative mx-auto h-56 max-w-64">
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
          </InView>
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
          <InView className="h-56">
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
          </InView>
        </ChartCard>
      )}

      {hasCoPlayers && (
        <ChartCard title="Most-played with" wide>
          <CoPlayersBars players={data.topCoPlayers} accent={c.accent2} />
        </ChartCard>
      )}
    </div>
  );
}

type CoPlayer = Detail["topCoPlayers"][number];

/** Horizontal "most-played with" bars — avatar labels that tooltip the name and
 *  link to the player's profile (account players only). Bars grow in when the
 *  section scrolls into view. */
function CoPlayersBars({
  players,
  accent,
}: {
  players: CoPlayer[];
  accent: string;
}) {
  const max = Math.max(...players.map((p) => p.plays), 1);
  const ref = useRef<HTMLUListElement>(null);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    if (grown) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setGrown(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [grown]);

  return (
    <ul ref={ref} className="space-y-2.5">
      {players.map((p, i) => {
        const pct = Math.max(Math.round((p.plays / max) * 100), 6);
        const avatar = p.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.avatarUrl}
            alt={p.name}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/12 text-xs font-bold text-accent">
            {p.name.charAt(0).toUpperCase()}
          </span>
        );
        const tooltip = (
          <span className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background shadow-lg group-hover:block">
            {p.name}
          </span>
        );
        const avatarNode = p.username ? (
          <Link
            href={`/user/${p.username}`}
            title={p.name}
            aria-label={p.name}
            className="group relative shrink-0 rounded-full ring-2 ring-transparent transition hover:ring-accent/40"
          >
            {avatar}
            {tooltip}
          </Link>
        ) : (
          <span title={p.name} className="group relative shrink-0 cursor-default">
            {avatar}
            {tooltip}
          </span>
        );
        return (
          <li key={i} className="flex items-center gap-3">
            {avatarNode}
            <div className="h-6 min-w-0 flex-1 overflow-hidden rounded-md bg-surface-2">
              <div
                className="flex h-full items-center justify-end rounded-md px-2 text-[11px] font-bold text-white transition-[width] duration-700 ease-out"
                style={{ width: grown ? `${pct}%` : "0%", backgroundColor: accent }}
              >
                {p.plays}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default GameStatsCharts;
