"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ChunkCard } from "@/components/admin/ChunkCard";

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

  const acceptedCount = chunks?.filter((c) => c.accepted).length ?? 0;

  async function handleCommit() {
    setWorking(true);
    setMessage(null);
    try {
      const r = await commit({ rulebookId: rbId });
      setMessage(`Committed ${r.committed} chunks — the chat can now use them.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Commit failed");
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
      setMessage(e instanceof Error ? e.message : "Re-ingest failed");
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

      <h2 className="font-semibold">Rulebook ingestion</h2>

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

      {/* Chunks */}
      {chunks && chunks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Chunks ({chunks.length})
          </h3>
          {chunks.map((c) => (
            <ChunkCard key={c._id} chunk={c} />
          ))}
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
    </div>
  );
}
