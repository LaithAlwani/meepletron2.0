"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ChunkCard, InsertChunkForm } from "@/components/admin/ChunkCard";
import { friendlyError } from "@/lib/friendlyError";
import { Plus, ChevronDown, ArrowUp } from "lucide-react";

type Filter = "all" | "flagged" | "excluded" | "edited";

/** Small labelled figure for the ingestion summary grid. */
function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <div
        className={`font-display text-lg font-bold ${
          tone === "warn" ? "text-red-600 dark:text-red-400" : "text-foreground"
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

export default function IngestReviewPage({
  params,
}: {
  params: Promise<{ id: string; rulebookId: string }>;
}) {
  const { id, rulebookId } = use(params);
  const gameId = id as Id<"games">;
  const rbId = rulebookId as Id<"rulebooks">;

  const status = useQuery(api.ingestionDb.getIngestStatus, { rulebookId: rbId });
  const chunks = useQuery(api.ingestionDb.listDraftChunks, { rulebookId: rbId });
  const commit = useAction(api.ingestion.commitIngestion);
  const restart = useAction(api.ingestion.startIngestion);
  const pause = useMutation(api.ingestionDb.pauseIngestion);
  const resume = useMutation(api.ingestionDb.resumeIngestion);
  const stop = useMutation(api.ingestionDb.stopIngestion);

  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [addingTop, setAddingTop] = useState(false);

  const acceptedCount = chunks?.filter((c) => c.accepted).length ?? 0;

  // Feedback: counts, flag breakdown, and pages that produced no chunk.
  const stats = useMemo(() => {
    if (!chunks) return null;
    const flagged = chunks.filter((c) => c.flags.length > 0);
    const flagCounts = new Map<string, number>();
    for (const c of flagged)
      for (const f of c.flags) flagCounts.set(f, (flagCounts.get(f) ?? 0) + 1);

    const pagesSeen = new Set<number>();
    for (const c of chunks) if (c.page != null) pagesSeen.add(c.page);
    const totalPages = status?.totalPages ?? 0;
    const missingPages: number[] = [];
    if (totalPages > 0 && pagesSeen.size > 0) {
      for (let p = 1; p <= totalPages; p++)
        if (!pagesSeen.has(p)) missingPages.push(p);
    }

    return {
      total: chunks.length,
      accepted: chunks.filter((c) => c.accepted).length,
      excluded: chunks.filter((c) => !c.accepted).length,
      edited: chunks.filter((c) => c.edited).length,
      flagged: flagged.length,
      flagCounts: [...flagCounts.entries()].sort((a, b) => b[1] - a[1]),
      totalPages,
      pagesCovered: pagesSeen.size,
      missingPages,
    };
  }, [chunks, status?.totalPages]);

  const visibleChunks = useMemo(() => {
    if (!chunks) return [];
    switch (filter) {
      case "flagged":
        return chunks.filter((c) => c.flags.length > 0);
      case "excluded":
        return chunks.filter((c) => !c.accepted);
      case "edited":
        return chunks.filter((c) => c.edited);
      default:
        return chunks;
    }
  }, [chunks, filter]);

  // Group the (filtered) chunks into contiguous top-level sections (breadcrumbs
  // are "Section > Sub > …"). Each group is collapsible and jump-to-able.
  const groups = useMemo(() => {
    const out: { id: string; label: string; chunks: Doc<"draftChunks">[] }[] =
      [];
    for (const c of visibleChunks) {
      const label =
        (c.breadcrumb?.split(">")[0] || "").trim() || "(no section)";
      const last = out[out.length - 1];
      if (last && last.label === label) last.chunks.push(c);
      else out.push({ id: c._id, label, chunks: [c] });
    }
    return out;
  }, [visibleChunks]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleSection = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const jumpToSection = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    // Defer so the section is expanded before we scroll to it.
    requestAnimationFrame(() =>
      document
        .getElementById(`sec-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  async function handleCommit() {
    setWorking(true);
    setMessage(null);
    try {
      const r = await commit({ rulebookId: rbId });
      setMessage(`Committed ${r.committed} chunks — the chat can now use them.`);
    } catch (e) {
      setMessage(friendlyError(e, "Commit failed"));
    } finally {
      setWorking(false);
    }
  }

  async function handleRestart() {
    setWorking(true);
    setMessage(null);
    try {
      await restart({ rulebookId: rbId });
    } catch (e) {
      setMessage(friendlyError(e, "Re-ingest failed"));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <Link
        href={`/admin/boardgames/${gameId}`}
        className="text-sm text-muted hover:text-foreground"
      >
        ← Back to game
      </Link>

      <h2 className="font-display text-lg font-bold">Rulebook ingestion</h2>

      {/* Status */}
      {status === undefined ? (
        <p className="text-muted">Loading…</p>
      ) : status === null ? (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-muted">This rulebook hasn&apos;t been ingested yet.</p>
          <button
            onClick={handleRestart}
            disabled={working}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            Start ingestion
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface p-4">
          {status.error && (
            <p className="mb-2 text-sm text-red-600 dark:text-red-400">
              Error: {status.error}
            </p>
          )}

          {status.status === "parsing" && (
            <div>
              <p className="text-sm font-medium">
                {status.control === "paused"
                  ? "Paused"
                  : status.control === "stopped"
                    ? "Stopped"
                    : "Parsing…"}{" "}
                {status.batchesDone}/{status.totalBatches} page-batches
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full transition-all ${
                    status.control === "running" ? "bg-accent" : "bg-muted"
                  }`}
                  style={{
                    width: `${
                      status.totalBatches
                        ? (status.batchesDone / status.totalBatches) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {status.control === "running" && (
                  <button
                    onClick={() => pause({ rulebookId: rbId })}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
                  >
                    Pause
                  </button>
                )}
                {(status.control === "paused" || status.control === "stopped") && (
                  <button
                    onClick={() => resume({ rulebookId: rbId })}
                    className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground hover:opacity-90"
                  >
                    Resume
                  </button>
                )}
                {status.control !== "stopped" && (
                  <button
                    onClick={() => stop({ rulebookId: rbId })}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-surface-2 dark:text-red-400"
                  >
                    Stop
                  </button>
                )}
                <button
                  onClick={handleRestart}
                  disabled={working}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
                >
                  Restart
                </button>
              </div>

              <p className="mt-2 text-xs text-muted">
                {status.control === "running"
                  ? "Runs in the background — you can leave and come back. Pause takes effect after the current page-batch."
                  : status.control === "paused"
                    ? "Paused — progress is kept. Resume to continue from here."
                    : "Stopped — partial progress is kept. Resume to continue, or Restart to redo from scratch."}
              </p>
            </div>
          )}

          {(status.status === "parsed" || status.status === "reviewing") && (
            <p className="text-sm">
              Parsing complete — review the chunks below and commit from the bar
              at the bottom.
            </p>
          )}

          {status.status === "committed" && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-green-600 dark:text-green-400">
                ✓ Committed — this rulebook is live in the chat.
              </p>
              <button
                onClick={handleRestart}
                disabled={working}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
              >
                Re-ingest
              </button>
            </div>
          )}

          {message && <p className="mt-3 text-sm text-muted">{message}</p>}
        </div>
      )}

      {/* Feedback summary */}
      {stats && stats.total > 0 && (
        <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Ingestion summary
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Chunks" value={stats.total} />
            <Stat label="Included" value={stats.accepted} />
            <Stat
              label="Pages covered"
              value={
                stats.totalPages
                  ? `${stats.pagesCovered}/${stats.totalPages}`
                  : stats.pagesCovered || "—"
              }
            />
            <Stat
              label="Flagged"
              value={stats.flagged}
              tone={stats.flagged > 0 ? "warn" : "default"}
            />
            {status && status.removedDuplicates > 0 && (
              <Stat label="Duplicates removed" value={status.removedDuplicates} />
            )}
            {stats.edited > 0 && <Stat label="Edited" value={stats.edited} />}
            {status?.geminiUsage && (
              <Stat
                label="Parse tokens"
                value={status.geminiUsage.totalTokens.toLocaleString()}
              />
            )}
          </div>

          {stats.flagCounts.length > 0 && (
            <p className="text-xs text-muted">
              Flags:{" "}
              {stats.flagCounts.map(([f, n], i) => (
                <span key={f}>
                  {i > 0 && ", "}
                  <span className="text-red-600 dark:text-red-400">{f}</span> ×{n}
                </span>
              ))}
            </p>
          )}

          {stats.missingPages.length > 0 && (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              <span className="font-semibold">
                {stats.missingPages.length} page
                {stats.missingPages.length === 1 ? "" : "s"} produced no chunks
              </span>{" "}
              (nothing extracted — check for missed content): p.
              {stats.missingPages.slice(0, 40).join(", p.")}
              {stats.missingPages.length > 40 && " …"}
            </p>
          )}
        </div>
      )}

      {/* Chunks */}
      {chunks && chunks.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Chunks ({visibleChunks.length}
              {filter !== "all" && ` of ${chunks.length}`})
            </h3>
            <div className="flex flex-wrap gap-1">
              {(["all", "flagged", "excluded", "edited"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    filter === f
                      ? "bg-accent text-accent-foreground"
                      : "border border-border text-muted hover:bg-surface-2"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {filter === "all" &&
            (addingTop ? (
              <InsertChunkForm
                rulebookId={rbId}
                onDone={() => setAddingTop(false)}
              />
            ) : (
              <button
                onClick={() => setAddingTop(true)}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Add chunk at top
              </button>
            ))}

          {groups.length > 1 && (
            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Jump to section
                </h4>
                <div className="flex gap-1">
                  <button
                    onClick={() => setCollapsed(new Set())}
                    className="rounded-md px-2 py-0.5 text-xs text-muted transition-colors hover:bg-surface hover:text-foreground"
                  >
                    Expand all
                  </button>
                  <button
                    onClick={() =>
                      setCollapsed(new Set(groups.map((g) => g.id)))
                    }
                    className="rounded-md px-2 py-0.5 text-xs text-muted transition-colors hover:bg-surface hover:text-foreground"
                  >
                    Collapse all
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => jumpToSection(g.id)}
                    className="flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/40 hover:text-foreground"
                  >
                    <span className="max-w-40 truncate">{g.label}</span>
                    <span className="text-subtle">{g.chunks.length}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {groups.length <= 1
            ? visibleChunks.map((c: Doc<"draftChunks">) => (
                <ChunkCard key={c._id} chunk={c} rulebookId={rbId} />
              ))
            : groups.map((g) => {
                const isCollapsed = collapsed.has(g.id);
                return (
                  <div
                    key={g.id}
                    id={`sec-${g.id}`}
                    className="scroll-mt-2 space-y-3"
                  >
                    <button
                      onClick={() => toggleSection(g.id)}
                      className="sticky top-0 z-10 flex w-full items-center gap-2 rounded-lg border border-border bg-surface-2/95 px-3 py-2 text-left backdrop-blur"
                    >
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-subtle transition-transform ${
                          isCollapsed ? "-rotate-90" : ""
                        }`}
                      />
                      <span className="truncate text-sm font-semibold">
                        {g.label}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-subtle">
                        {g.chunks.length} chunk{g.chunks.length === 1 ? "" : "s"}
                      </span>
                    </button>
                    {!isCollapsed &&
                      g.chunks.map((c) => (
                        <ChunkCard key={c._id} chunk={c} rulebookId={rbId} />
                      ))}
                  </div>
                );
              })}

          {visibleChunks.length === 0 && (
            <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted">
              No chunks match “{filter}”.
            </p>
          )}
        </div>
      )}

      {/* Bottom commit — so you don't have to scroll back up after reviewing. */}
      {status &&
        status !== null &&
        (status.status === "parsed" || status.status === "reviewing") &&
        chunks &&
        chunks.length > 0 && (
          <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface/90 p-4 shadow-lg backdrop-blur">
            <p className="text-sm">
              <span className="font-medium">{acceptedCount}</span> of{" "}
              {chunks.length} chunks selected.
            </p>
            <button
              onClick={handleCommit}
              disabled={working || acceptedCount === 0}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
            >
              {working ? "Committing…" : `Commit ${acceptedCount} chunks`}
            </button>
          </div>
        )}

      <ScrollTopButton />
    </div>
  );
}

/** Floating "back to top" button — appears after scrolling down a bit. */
function ScrollTopButton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!show) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Scroll to top"
      title="Scroll to top"
      className="fixed bottom-24 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-lg transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
