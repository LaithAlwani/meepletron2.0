"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/ui/Toast";
import { friendlyError } from "@/lib/friendlyError";

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
      toast(friendlyError(e, "Couldn't delete the game"), "error");
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

  const typeOptions: { key: TypeFilter; label: string; count: number }[] = [
    { key: "all", label: "All types", count: typeCounts.all },
    { key: "base", label: "Base games", count: typeCounts.base },
    { key: "expansion", label: "Expansions", count: typeCounts.expansion },
  ];
  const statusOptions: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: "Any status", count: statusCounts.all },
    { key: "pending", label: "Not ingested", count: statusCounts.pending },
    { key: "done", label: "Ingested", count: statusCounts.done },
    { key: "none", label: "Missing file", count: statusCounts.none },
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
        <div className="mb-4 flex gap-2">
          <FilterSelect
            ariaLabel="Filter by type"
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as TypeFilter)}
            options={typeOptions}
          />
          <FilterSelect
            ariaLabel="Filter by ingestion status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={statusOptions}
          />
        </div>
      )}

      {games === undefined ? (
        <p className="text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted">No games match these filters.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {shown.map((g) => (
              <GameRow
                key={g._id}
                game={g}
                onDelete={() => handleDelete(g._id, g.title)}
              />
            ))}
          </ul>
          <div ref={sentinelRef} aria-hidden className="h-px" />
          <p className="mt-3 text-center text-xs text-subtle">
            Showing {shown.length} of {filtered.length}
          </p>
          <p className="mt-1 text-center text-[11px] text-subtle sm:hidden">
            Tap a game to edit · swipe left to delete.
          </p>
        </>
      )}
    </div>
  );
}

/** Compact native-select filter — uses the OS picker on mobile. */
function FilterSelect<T extends string>({
  ariaLabel,
  value,
  onChange,
  options,
}: {
  ariaLabel: string;
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string; count: number }[];
}) {
  return (
    <div className="relative min-w-0 flex-1 sm:flex-none sm:w-52">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full appearance-none truncate rounded-lg border border-border bg-surface py-2 pl-3 pr-9 text-sm font-medium outline-none focus:ring-2 focus:ring-accent/40"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label} ({o.count})
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
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

const TrashIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

/**
 * A game row. Tapping/clicking the card opens the edit page. Touch devices
 * delete by swiping the card left; mouse users get a trash button (they can't
 * swipe). Axis-locked so vertical scrolling is unaffected, and delete always
 * routes through the confirm dialog.
 */
function GameRow({ game, onDelete }: { game: AdminGame; onDelete: () => void }) {
  const editHref = `/admin/boardgames/${game._id}`;
  const status = ingestStatus(game);

  const MAX = 96;
  const THRESHOLD = 60;
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const active = useRef(false);
  const axis = useRef<null | "x" | "y">(null);
  const swiped = useRef(false);
  const dxRef = useRef(0);

  function onDown(e: React.PointerEvent) {
    if (e.pointerType !== "touch") return; // mouse deletes via the trash button
    active.current = true;
    axis.current = null;
    swiped.current = false;
    startX.current = e.clientX;
    startY.current = e.clientY;
  }
  function onMove(e: React.PointerEvent) {
    if (!active.current) return;
    const mx = e.clientX - startX.current;
    const my = e.clientY - startY.current;
    if (axis.current === null) {
      if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
      axis.current = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (axis.current === "x") {
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    }
    if (axis.current !== "x") return;
    swiped.current = true;
    const d = Math.max(-MAX, Math.min(0, mx)); // left-swipe only
    dxRef.current = d;
    setDx(d);
  }
  function onUp() {
    if (!active.current) return;
    active.current = false;
    const d = dxRef.current;
    axis.current = null;
    setDragging(false);
    dxRef.current = 0;
    setDx(0);
    if (d <= -THRESHOLD) onDelete();
  }

  const armed = dx <= -THRESHOLD;

  return (
    <li className="relative select-none overflow-hidden rounded-lg">
      {/* Delete reveal behind the card (touch swipe-left) */}
      <div
        aria-hidden
        className={`absolute inset-y-0 right-0 flex w-24 items-center justify-end gap-1.5 bg-red-600 px-4 text-sm font-medium text-white transition-opacity sm:hidden ${dx < -4 ? "opacity-100" : "opacity-0"}`}
      >
        {armed ? "Release" : "Delete"}
        {TrashIcon}
      </div>

      {/* Foreground card — the whole thing links to Edit. */}
      <Link
        href={editHref}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={(e) => {
          if (swiped.current) e.preventDefault(); // don't navigate after a swipe
        }}
        style={{ transform: `translateX(${dx}px)`, touchAction: "pan-y" }}
        className={`relative flex items-center gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:bg-surface-2 sm:pr-14 ${dragging ? "" : "transition-transform duration-200"}`}
      >
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-2">
          {game.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={game.thumbnailUrl}
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
          <p className="truncate font-medium">{game.title}</p>
          <p className="truncate text-xs text-muted">{game.slug}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {game.isExpansion && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                Expansion
              </span>
            )}
            <IngestBadge
              status={status}
              ingested={game.ingestedCount}
              total={game.fileCount}
            />
          </div>
        </div>
      </Link>

      {/* Desktop delete (mouse users can't swipe). Overlaid, outside the link. */}
      <button
        onClick={onDelete}
        aria-label={`Delete ${game.title}`}
        title="Delete"
        className="absolute right-3 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-border bg-surface text-red-600 transition-colors hover:bg-red-500/10 sm:flex dark:text-red-400"
      >
        {TrashIcon}
      </button>
    </li>
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
