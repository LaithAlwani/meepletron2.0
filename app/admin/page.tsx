"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  Users,
  Puzzle,
  Ghost,
  MessagesSquare,
  User,
  Bot,
  Calendar,
  TrendingUp,
  DollarSign,
} from "lucide-react";
import type { ComponentType } from "react";
import { api } from "@/convex/_generated/api";
import { Die } from "@/components/ui/icons";
import { buttonClasses } from "@/components/ui/Button";

const num = (n: number) => n.toLocaleString();
const compact = (n: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function StatCard({
  icon: Icon,
  tint,
  value,
  label,
  hint,
  href,
}: {
  icon: ComponentType<{ className?: string }>;
  tint: string;
  value: string;
  label: string;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <div className="h-full rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:bg-surface-2">
      <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-full ${tint}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="font-display text-2xl font-bold sm:text-3xl">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
      {hint && <div className="mt-1 text-xs text-subtle">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export default function AdminOverviewPage() {
  const monthStart = useMemo(() => {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }, []);
  const stats = useQuery(api.admin.dashboardStats, { monthStart });
  const guestStats = useQuery(api.admin.adminGuestStats);

  const dash = (value: string) => (stats === undefined ? "—" : value);

  return (
    <div className="space-y-6">
      {/* Library */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Library
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            icon={Users}
            tint="bg-blue-500/15 text-blue-600 dark:text-blue-400"
            value={dash(num(stats?.users ?? 0))}
            label="Users"
            hint={
              stats
                ? `${num(stats.registeredUsers)} registered · ${num(stats.guestUsers)} guests`
                : undefined
            }
            href="/admin/users"
          />
          <StatCard
            icon={Die}
            tint="bg-purple-500/15 text-purple-600 dark:text-purple-400"
            value={dash(num(stats?.baseGames ?? 0))}
            label="Base games"
            href="/admin/boardgames"
          />
          <StatCard
            icon={Puzzle}
            tint="bg-amber-500/15 text-amber-600 dark:text-amber-400"
            value={dash(num(stats?.expansions ?? 0))}
            label="Expansions"
            href="/admin/boardgames"
          />
          <StatCard
            icon={Ghost}
            tint="bg-slate-500/15 text-slate-600 dark:text-slate-400"
            value={guestStats === undefined ? "—" : num(guestStats.active)}
            label="Active guests"
            hint={
              guestStats
                ? `${num(guestStats.empty)} empty (bots) · auto-pruned after 48h`
                : undefined
            }
            href="/admin/users"
          />
        </div>
      </section>

      {/* Messages */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Messages
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            icon={MessagesSquare}
            tint="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
            value={dash(num(stats?.messages.total ?? 0))}
            label="All messages"
          />
          <StatCard
            icon={User}
            tint="bg-sky-500/15 text-sky-600 dark:text-sky-400"
            value={dash(num(stats?.messages.byUser ?? 0))}
            label="From users"
          />
          <StatCard
            icon={Bot}
            tint="bg-violet-500/15 text-violet-600 dark:text-violet-400"
            value={dash(num(stats?.messages.byAi ?? 0))}
            label="From the AI"
          />
        </div>
      </section>

      {/* AI usage */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          AI usage
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            icon={Calendar}
            tint="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            value={dash(
              compact((stats?.tokensMonth.input ?? 0) + (stats?.tokensMonth.output ?? 0)),
            )}
            label="Tokens this month"
            hint={
              stats
                ? `${compact(stats.tokensMonth.input)} in · ${compact(stats.tokensMonth.output)} out`
                : undefined
            }
            href="/admin/usage"
          />
          <StatCard
            icon={TrendingUp}
            tint="bg-teal-500/15 text-teal-600 dark:text-teal-400"
            value={dash(
              compact((stats?.tokensTotal.input ?? 0) + (stats?.tokensTotal.output ?? 0)),
            )}
            label="Tokens all time"
            hint={
              stats
                ? `${compact(stats.tokensTotal.input)} in · ${compact(stats.tokensTotal.output)} out`
                : undefined
            }
            href="/admin/usage"
          />
          <StatCard
            icon={DollarSign}
            tint="bg-green-500/15 text-green-600 dark:text-green-400"
            value={dash(usd(stats?.costMonth ?? 0))}
            label="Est. cost this month"
            hint={stats ? `${usd(stats.costTotal)} all time` : undefined}
            href="/admin/usage"
          />
        </div>
      </section>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-lg font-bold">Manage content</h2>
        <p className="mt-1 text-sm text-muted">
          Add games, upload rulebooks, and run ingestion.
        </p>
        <Link
          href="/admin/boardgames"
          className={`mt-3 ${buttonClasses("primary", "sm")}`}
        >
          Go to games
        </Link>
      </div>
    </div>
  );
}
