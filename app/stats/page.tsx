"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useQuery,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  MessageSquare,
  MessagesSquare,
  Bot,
  ThumbsUp,
  Library,
  Dices,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PlayerStatsCard } from "@/components/plays/PlayerStatsCard";
import { GameStatsModal } from "@/components/plays/GameStatsModal";
import { PageTitle } from "@/components/ui/PageTitle";
import { Skeleton } from "@/components/ui/Surface";
import { Thumb } from "@/components/top-games/Thumb";

export default function StatsPage() {
  return (
    <div className="min-h-screen px-4 pb-16 pt-10">
      <div className="mx-auto max-w-3xl">
        <PageTitle className="mb-6">Stats</PageTitle>
        <AuthLoading>
          <p className="text-center text-muted">Loading…</p>
        </AuthLoading>
        <Unauthenticated>
          <div className="rounded-2xl border border-border-muted bg-surface p-8 text-center">
            <p className="text-sm text-muted">You&apos;re not signed in.</p>
            <Link
              href="/auth"
              className="mt-3 inline-block rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
            >
              Sign in
            </Link>
          </div>
        </Unauthenticated>
        <Authenticated>
          <StatsBody />
        </Authenticated>
      </div>
    </div>
  );
}

function StatsBody() {
  const stats = useQuery(api.users.myStats);
  const bgg = useQuery(api.bggSync.myAccount);
  const monthStart = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }, []);
  const playStats = useQuery(api.plays.myPlayStats, {
    monthStartDate: monthStart,
  });
  const engagement = useQuery(api.plays.playEngagement, {});
  const [selected, setSelected] = useState<{
    gameId: Id<"games"> | null;
    title: string;
  } | null>(null);

  const ratingPct =
    stats && stats.correctRatings + stats.wrongRatings > 0
      ? Math.round(
          (stats.correctRatings /
            (stats.correctRatings + stats.wrongRatings)) *
            100,
        )
      : null;

  return (
    <div>
      {/* Plays */}
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-subtle">
          Plays
        </p>
        <Link
          href="/plays"
          className="text-xs font-semibold text-accent hover:underline"
        >
          View all
        </Link>
      </div>
      <div className="mb-6">
        <PlayerStatsCard stats={playStats} engagement={engagement} />
      </div>

      {/* By game */}
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-subtle">
        By game
      </p>
      <div className="mb-6">
        <PerGameStats
          games={playStats?.games}
          capped={playStats?.capped ?? false}
          onOpen={setSelected}
        />
      </div>

      {/* Activity */}
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-subtle">
        Activity
      </p>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Chats" value={stats?.totalChats} color="blue" icon={MessagesSquare} />
        <StatCard label="Messages Sent" value={stats?.userMessages} color="violet" icon={MessageSquare} />
        <StatCard label="AI Responses" value={stats?.aiMessages} color="slate" icon={Bot} />
        <StatCard
          label="Rating Score"
          value={ratingPct !== null ? `${ratingPct}%` : stats ? "No ratings" : undefined}
          sub={
            stats && ratingPct !== null
              ? `${stats.correctRatings} up · ${stats.wrongRatings} down`
              : undefined
          }
          color="green"
          icon={ThumbsUp}
        />
        {bgg && (
          <StatCard
            label="Games Owned"
            value={bgg.collectionCount ?? 0}
            sub={bgg.username}
            color="blue"
            icon={Library}
          />
        )}
      </div>

      {selected && (
        <GameStatsModal
          gameId={selected.gameId}
          title={selected.title}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

type GameStats = NonNullable<
  FunctionReturnType<typeof api.plays.myPlayStats>
>["games"];

const GAMES_CAP = 25;

function PerGameStats({
  games,
  capped,
  onOpen,
}: {
  games: GameStats | undefined;
  capped: boolean;
  onOpen: (g: { gameId: Id<"games"> | null; title: string }) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (games === undefined) {
    return <Skeleton className="h-40 w-full rounded-2xl" />;
  }
  if (games.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
        Log a play to start building your per-game record.
      </p>
    );
  }
  const shown = showAll ? games : games.slice(0, GAMES_CAP);
  return (
    <div className="overflow-hidden rounded-2xl border border-border-muted bg-surface">
      {/* Desktop: compact table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-110 text-sm">
          <thead>
            <tr className="border-b border-border-muted text-[11px] uppercase tracking-wider text-subtle">
              <th className="px-4 py-2.5 text-left font-semibold">Game</th>
              <th className="px-2 py-2.5 text-center font-semibold">Plays</th>
              <th className="px-2 py-2.5 text-center font-semibold">Won</th>
              <th className="px-2 py-2.5 text-center font-semibold">Win %</th>
              <th className="px-4 py-2.5 text-right font-semibold">Best</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((g) => (
              <tr
                key={g.gameId ?? g.title}
                onClick={() => onOpen({ gameId: g.gameId, title: g.title })}
                className="cursor-pointer border-b border-border-muted transition-colors last:border-0 hover:bg-surface-2"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-surface-2">
                      {g.coverUrl ? (
                        <Thumb url={g.coverUrl} className="h-9 w-9" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-subtle">
                          <Dices className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <span className="min-w-0 truncate font-semibold">
                      {g.title}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-center tabular-nums">{g.plays}</td>
                <td className="px-2 py-2.5 text-center tabular-nums">{g.wins}</td>
                <td className="px-2 py-2.5 text-center tabular-nums">
                  {g.winPct === null ? (
                    <span className="text-subtle">—</span>
                  ) : (
                    `${g.winPct}%`
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                  {g.bestScore === null ? (
                    <span className="font-normal text-subtle">—</span>
                  ) : (
                    g.bestScore
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked blocks — header, a dashed divider, then the stats */}
      <div className="sm:hidden">
        {shown.map((g) => (
          <button
            key={g.gameId ?? g.title}
            onClick={() => onOpen({ gameId: g.gameId, title: g.title })}
            className="block w-full border-b border-border-muted px-4 py-3.5 text-left transition-colors last:border-0 hover:bg-surface-2"
          >
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                {g.coverUrl ? (
                  <Thumb url={g.coverUrl} className="h-11 w-11" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-subtle">
                    <Dices className="h-5 w-5" />
                  </div>
                )}
              </div>
              <span className="font-display min-w-0 flex-1 truncate font-bold">
                {g.title}
              </span>
            </div>

            {/* Inner divider — a soft gradient hairline, distinct from the solid
                between-games separators */}
            <div className="my-3 h-px bg-linear-to-r from-transparent via-border to-transparent" />

            <div className="flex items-start justify-between">
              <GameStatCell label="Plays" value={g.plays} />
              <GameStatCell label="Won" value={g.wins} />
              <GameStatCell
                label="Win %"
                value={g.winPct === null ? "—" : `${g.winPct}%`}
                muted={g.winPct === null}
              />
              <GameStatCell
                label="Best"
                value={g.bestScore ?? "—"}
                muted={g.bestScore === null}
                align="right"
              />
            </div>
          </button>
        ))}
      </div>

      {games.length > GAMES_CAP && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full border-t border-border-muted py-2.5 text-center text-xs font-semibold text-accent transition-colors hover:bg-surface-2"
        >
          {showAll ? "Show less" : `Show all ${games.length} games`}
        </button>
      )}
      {capped && (
        <p className="border-t border-border-muted px-4 py-2.5 text-center text-[11px] text-subtle">
          Based on your 1,000 most recent plays.
        </p>
      )}
    </div>
  );
}

function GameStatCell({
  label,
  value,
  muted,
  align = "left",
}: {
  label: string;
  value: number | string;
  muted?: boolean;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="text-[11px] uppercase tracking-wider text-subtle">
        {label}
      </div>
      <div
        className={`mt-0.5 text-lg font-bold tabular-nums ${muted ? "text-subtle" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

const colorMap: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  green: "bg-green-500/10 text-green-600 dark:text-green-400",
};

function StatCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string;
  value?: number | string;
  sub?: string;
  color: keyof typeof colorMap | string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-border-muted bg-surface p-4 shadow-sm">
      <div
        className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${colorMap[color] ?? colorMap.slate}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-2xl font-bold text-foreground">
        {value === undefined ? "—" : value}
      </div>
      <div className="text-xs text-subtle">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-subtle">{sub}</div>}
    </div>
  );
}
