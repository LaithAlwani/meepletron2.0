"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-surface-2"
    >
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </Link>
  );
}

export default function AdminOverviewPage() {
  const games = useQuery(api.games.list);
  const users = useQuery(api.users.adminListUsers);
  const usage = useQuery(api.admin.usageSummary);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Base games"
          value={games === undefined ? "—" : games.length.toString()}
          href="/admin/boardgames"
        />
        <StatCard
          label="Users"
          value={users === undefined ? "—" : users.length.toString()}
          href="/admin/users"
        />
        <StatCard
          label="Est. AI cost"
          value={
            usage === undefined
              ? "—"
              : `$${usage.totalCost.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
          }
          href="/admin/usage"
        />
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold">Manage content</h2>
        <p className="mt-1 text-sm text-muted">
          Add games, upload rulebooks, and run ingestion.
        </p>
        <Link
          href="/admin/boardgames"
          className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          Go to games
        </Link>
      </div>
    </div>
  );
}
