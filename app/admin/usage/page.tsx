"use client";

import { useEffect, useState } from "react";
import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { buttonClasses } from "@/components/ui/buttonStyles";

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const num = (n: number) => n.toLocaleString();

/** How far back the usage summary looks. */
const WINDOW_DAYS = 30;

type Summary = FunctionReturnType<typeof api.admin.usageSummary>;
type Ingestion = FunctionReturnType<typeof api.admin.ingestionCosts>;

export default function AdminUsagePage() {
  // One-shot fetches (+ a Refresh button) instead of live subscriptions: the
  // usage log gains rows on every chat answer, so a subscription re-read up to
  // 20k rows per message while this page was open.
  const convex = useConvex();
  const [summary, setSummary] = useState<Summary | undefined>(undefined);
  const [ingestion, setIngestion] = useState<Ingestion | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // Bumped by Refresh; `loaded` trails it until that fetch settles.
  const [refreshKey, setRefreshKey] = useState(0);
  const [loaded, setLoaded] = useState(-1);
  const loading = loaded !== refreshKey;

  useEffect(() => {
    let cancelled = false;
    const sinceMs = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
    Promise.all([
      convex.query(api.admin.usageSummary, { sinceMs }),
      convex.query(api.admin.ingestionCosts, {}),
    ])
      .then(([s, i]) => {
        if (cancelled) return;
        setSummary(s);
        setIngestion(i);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load usage");
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(refreshKey);
      });
    return () => {
      cancelled = true;
    };
  }, [convex, refreshKey]);

  if (summary === undefined) {
    return (
      <p className="text-muted">{error ? `Couldn't load usage: ${error}` : "Loading…"}</p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Last {WINDOW_DAYS} days{error ? ` · refresh failed: ${error}` : ""}
        </p>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          className={buttonClasses("ghost", "sm")}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
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

      <IngestionTable data={ingestion} />
    </div>
  );
}

function IngestionTable({
  data,
}: {
  data:
    | {
        rows: {
          id: string;
          gameTitle: string;
          rulebook: string;
          pages: number | null;
          status: string;
          tokens: number;
          cost: number;
        }[];
        totalTokens: number;
        totalCost: number;
      }
    | undefined;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Ingestion cost per rulebook
        </h3>
        {data && (
          <span className="text-xs text-muted">
            {num(data.totalTokens)} tokens · {usd(data.totalCost)} total
          </span>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Game / rulebook</th>
              <th className="px-3 py-2 text-right font-medium">Pages</th>
              <th className="px-3 py-2 text-right font-medium">Tokens</th>
              <th className="px-3 py-2 text-right font-medium">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted">
                  Loading…
                </td>
              </tr>
            ) : data.rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted">
                  No rulebooks ingested yet.
                </td>
              </tr>
            ) : (
              data.rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.gameTitle}</span>
                    <span className="text-muted"> · {r.rulebook}</span>
                    {r.status !== "committed" && (
                      <span className="ml-1 text-xs text-muted">({r.status})</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{r.pages ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{num(r.tokens)}</td>
                  <td className="px-3 py-2 text-right">{usd(r.cost)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-muted">
        Parse (Gemini vision) cost per PDF. Embedding is negligible and not
        billed by token, so it&apos;s excluded.
      </p>
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
