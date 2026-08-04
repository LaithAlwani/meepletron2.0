"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/ui/Toast";

type IngestStatus = "done" | "pending" | "none";
type TypeFilter = "all" | "base" | "expansion";
type StatusFilter = "all" | IngestStatus;

type AdminGame = {
  _id: Id<"games">;
  title: string;
  slug: string;
  isExpansion: boolean;
  thumbnailUrl: string | null;
  fileCount: number;
  ingestedCount: number;
};

function ingestStatus(g: { fileCount: number; ingestedCount: number }): IngestStatus {
  if (g.fileCount === 0) return "none";
  return g.ingestedCount >= g.fileCount ? "done" : "pending";
}

const PAGE = 20;

export default function AdminGamesPage() {
  const games = useQuery(api.games.adminList) as AdminGame[] | undefined;
  const deleteGame = useMutation(api.games.deleteGame);
  const confirm = useConfirm();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [visible, setVisible] = useState(PAGE);

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

  const q = search.trim().toLowerCase();
  const bySearch = useMemo(
    () =>
      (games ?? []).filter(
        (g) =>
          !q ||
          g.title.toLowerCase().includes(q) ||
          g.slug.toLowerCase().includes(q),
      ),
    [games, q],
  );
  const matchesType = (g: AdminGame) =>
    typeFilter === "all" ||
    (typeFilter === "base" ? !g.isExpansion : g.isExpansion);
  const matchesStatus = (g: AdminGame) =>
    statusFilter === "all" || ingestStatus(g) === statusFilter;

  const filtered = useMemo(
    () => bySearch.filter((g) => matchesType(g) && matchesStatus(g)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bySearch, typeFilter, statusFilter],
  );

  // Faceted counts: each pill counts items passing the *other* dimension.
  const typeCounts = {
    all: bySearch.filter(matchesStatus).length,
    base: bySearch.filter((g) => !g.isExpansion && matchesStatus(g)).length,
    expansion: bySearch.filter((g) => g.isExpansion && matchesStatus(g)).length,
  };
  const statusCounts = {
    all: bySearch.filter(matchesType).length,
    done: bySearch.filter((g) => matchesType(g) && ingestStatus(g) === "done").length,
    pending: bySearch.filter((g) => matchesType(g) && ingestStatus(g) === "pending").length,
    none: bySearch.filter((g) => matchesType(g) && ingestStatus(g) === "none").length,
  };

  const baseCount = games?.filter((g) => !g.isExpansion).length ?? 0;
  const expCount = games?.filter((g) => g.isExpansion).length ?? 0;

  // Reset the window whenever the filtered set changes.
  useEffect(() => {
    setVisible(PAGE);
  }, [q, typeFilter, statusFilter]);

  // Auto-load more rows as the sentinel scrolls into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const canLoadMore = visible < filtered.length;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !canLoadMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible((v) => v + PAGE);
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canLoadMore, filtered.length]);

  const shown = filtered.slice(0, visible);

  const typePills: { key: TypeFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "base", label: "Base games" },
    { key: "expansion", label: "Expansions" },
  ];
  const statusPills: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Not ingested" },
    { key: "done", label: "Ingested" },
    { key: "none", label: "Missing file" },
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

      {/* Search */}
      <div className="relative mb-3">
        <SearchIcon />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search games and expansions…"
          className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      {games && (
        <div className="mb-4 space-y-2">
          <PillRow>
            {typePills.map((p) => (
              <Pill
                key={p.key}
                active={typeFilter === p.key}
                onClick={() => setTypeFilter(p.key)}
                label={p.label}
                count={typeCounts[p.key]}
              />
            ))}
          </PillRow>
          <PillRow>
            {statusPills.map((p) => (
              <Pill
                key={p.key}
                active={statusFilter === p.key}
                onClick={() => setStatusFilter(p.key)}
                label={p.label}
                count={statusCounts[p.key]}
              />
            ))}
          </PillRow>
        </div>
      )}

      {games === undefined ? (
        <p className="text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted">No games match these filters.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {shown.map((g) => {
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
                        loading="lazy"
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
          <div ref={sentinelRef} aria-hidden className="h-px" />
          <p className="mt-3 text-center text-xs text-subtle">
            Showing {shown.length} of {filtered.length}
          </p>
        </>
      )}
    </div>
  );
}

function PillRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

function Pill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-accent text-accent-foreground"
          : "border border-border bg-surface text-muted hover:bg-surface-2"
      }`}
    >
      {label}
      <span className={`ml-1.5 ${active ? "opacity-80" : "text-subtle"}`}>
        {count}
      </span>
    </button>
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

const SearchIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);
