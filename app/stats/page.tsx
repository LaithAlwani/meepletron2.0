"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  useQuery,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import {
  MessageSquare,
  MessagesSquare,
  Bot,
  ThumbsUp,
  Library,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PlayerStatsCard } from "@/components/plays/PlayerStatsCard";
import { PageTitle } from "@/components/ui/PageTitle";

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
