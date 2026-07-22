"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const num = (n: number) => n.toLocaleString();

export default function AdminUsagePage() {
  const summary = useQuery(api.admin.usageSummary);

  if (summary === undefined) return <p className="text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Estimated cost" value={usd(summary.totalCost)} />
        <Stat label="Total tokens" value={num(summary.totalTokens)} />
        <Stat label="Logged calls" value={num(summary.sampled)} />
      </div>

      {summary.capped && (
        <p className="text-xs text-muted">
          Showing the most recent {num(summary.sampled)} usage records.
        </p>
      )}

      <Table
        title="By purpose"
        rows={summary.byPurpose.map((p) => ({
          key: p.purpose,
          label: p.purpose,
          calls: p.calls,
          tokens: p.tokens,
          cost: p.cost,
        }))}
      />
      <Table
        title="By model"
        rows={summary.byModel.map((m) => ({
          key: m.model,
          label: m.model,
          calls: m.calls,
          tokens: m.tokens,
          cost: m.cost,
        }))}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function Table({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; calls: number; tokens: number; cost: number }[];
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 text-right font-medium">Calls</th>
              <th className="px-3 py-2 text-right font-medium">Tokens</th>
              <th className="px-3 py-2 text-right font-medium">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted">
                  No usage yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.key} className="border-t border-border">
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 text-right">{num(r.calls)}</td>
                  <td className="px-3 py-2 text-right">{num(r.tokens)}</td>
                  <td className="px-3 py-2 text-right">{usd(r.cost)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
