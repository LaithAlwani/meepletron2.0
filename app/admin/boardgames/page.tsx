"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/ui/Toast";

type IngestStatus = "done" | "pending" | "none";
type Filter = "all" | "pending" | "done" | "none";

function ingestStatus(g: {
  fileCount: number;
  ingestedCount: number;
}): IngestStatus {
  if (g.fileCount === 0) return "none";
  return g.ingestedCount >= g.fileCount ? "done" : "pending";
}

export default function AdminGamesPage() {
  const games = useQuery(api.games.adminList);
  const deleteGame = useMutation(api.games.deleteGame);
  const confirm = useConfirm();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");

  async function handleDelete(id: Id<"games">, title: string) {
    const ok = await confirm({
      title: `Delete “${title}”?`,
      message:
        "This permanently removes the game and all its rulebooks, chunks, and chats. This can't be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteGame({ gameId: id });
      toast(`Deleted “${title}”`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete the game", "error");
    }
  }

  const baseCount = games?.filter((g) => !g.isExpansion).length ?? 0;
  const expCount = games?.filter((g) => g.isExpansion).length ?? 0;

  const counts = { all: 0, pending: 0, done: 0, none: 0 };
  if (games) {
    counts.all = games.length;
    for (const g of games) counts[ingestStatus(g)]++;
  }

  const filtered = games?.filter((g) =>
    filter === "all" ? true : ingestStatus(g) === filter,
  );

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Needs ingestion" },
    { key: "done", label: "Ingested" },
    { key: "none", label: "No files" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">All games</h2>
          {games && (
            <p className="mt-0.5 text-xs text-muted">
              <span className="font-medium text-foreground">{baseCount}</span> base
              {" · "}
              <span className="font-medium text-foreground">{expCount}</span>{" "}
              expansion{expCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <Link
          href="/admin/boardgames/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          Add game
        </Link>
      </div>

      {/* Ingestion progress filter */}
      {games && (
        <div className="mb-4 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === c.key
                  ? "bg-accent text-accent-foreground"
                  : "border border-border bg-surface text-muted hover:bg-surface-2"
              }`}
            >
              {c.label}
              <span
                className={`ml-1.5 ${filter === c.key ? "opacity-80" : "text-subtle"}`}
              >
                {counts[c.key]}
              </span>
            </button>
          ))}
        </div>
      )}

      {games === undefined ? (
        <p className="text-muted">Loading…</p>
      ) : games.length === 0 ? (
        <p className="text-muted">No games yet.</p>
      ) : filtered && filtered.length === 0 ? (
        <p className="text-muted">No games match this filter.</p>
      ) : (
        <ul className="space-y-2">
          {filtered!.map((g) => {
            const status = ingestStatus(g);
            return (
              <li
                key={g._id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-2">
                  {g.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={g.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center opacity-40">
                      🎲
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="truncate">{g.title}</span>
                    {g.isExpansion && (
                      <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                        Expansion
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span className="truncate">{g.slug}</span>
                    <IngestBadge
                      status={status}
                      ingested={g.ingestedCount}
                      total={g.fileCount}
                    />
                  </div>
                </div>
                <Link
                  href={`/admin/boardgames/${g._id}`}
                  className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(g._id, g.title)}
                  className="shrink-0 text-sm text-red-600 hover:underline dark:text-red-400"
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function IngestBadge({
  status,
  ingested,
  total,
}: {
  status: IngestStatus;
  ingested: number;
  total: number;
}) {
  if (status === "none") {
    return (
      <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-subtle">
        No files
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="shrink-0 rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-600 dark:text-green-400">
        Ingested {total}/{total}
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
      {ingested}/{total} ingested
    </span>
  );
}
