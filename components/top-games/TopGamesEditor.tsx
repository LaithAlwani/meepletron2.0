"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useAction } from "convex/react";
import { GripVertical, X, Search, Plus, Check, Star } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useGameSearch } from "@/components/boardgames/useGameSearch";
import { Thumb } from "./Thumb";
import { buttonClasses } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { cn } from "@/lib/cn";
import { topListTitle } from "@/lib/topGamesTitle";
import { useReorder } from "./useReorder";

type Row = {
  gameId: Id<"games">;
  title: string;
  thumbUrl: string | null;
  slug: string | null;
};

type Item = {
  gameId: Id<"games">;
  title: string;
  game: { slug: string; title: string; thumbUrl: string | null } | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

/** Keep in sync with convex/topGames.ts. */
const HM_DRAFT_MAX = 50;
const HM_KEPT = 5;

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function TopGamesEditor({
  listId,
  size,
  year,
  title,
  items,
}: {
  listId: Id<"topGamesLists">;
  size: number;
  year: number;
  title: string | null;
  items: Item[];
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const setEntries = useMutation(api.topGames.setEntries);
  const finalizeList = useMutation(api.topGames.finalize);
  const renameList = useMutation(api.topGames.rename);

  const [rows, setRows] = useState<Row[]>(() =>
    items.map((it) => ({
      gameId: it.gameId,
      title: it.game?.title ?? it.title,
      thumbUrl: it.game?.thumbUrl ?? null,
      slug: it.game?.slug ?? null,
    })),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [name, setName] = useState(title ?? "");
  const [pitch, setPitch] = useState(0);
  const touched = useRef(false);

  // The full title as it will display — the name is slotted between size + year.
  const previewTitle = topListTitle(size, year, name);
  const added = new Set(rows.map((r) => r.gameId));
  const mainCount = Math.min(rows.length, size);
  const hmCount = Math.max(0, rows.length - size);
  const overSize = rows.length > size;
  const atCap = rows.length >= size + HM_DRAFT_MAX;

  // Debounced autosave of the ordered membership.
  useEffect(() => {
    if (!touched.current) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        await setEntries({ id: listId, gameIds: rows.map((r) => r.gameId) });
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 800);
    return () => clearTimeout(t);
  }, [rows, listId, setEntries]);

  const { containerRef, dragIndex, dragging, handleProps, rowStyle } = useReorder(
    rows.length,
    (from, to) => {
      touched.current = true;
      setRows((r) => arrayMove(r, from, to));
    },
  );

  // Measure the row pitch so the "honorable mentions" divider can sit exactly on
  // the cut line (rows are uniform height; pitch = gap between the first two).
  useLayoutEffect(() => {
    function measure() {
      const c = containerRef.current;
      if (!c || c.children.length < 2) return setPitch(0);
      const a = c.children[0] as HTMLElement;
      const b = c.children[1] as HTMLElement;
      setPitch(b.offsetTop - a.offsetTop);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [rows.length, containerRef]);

  function addGame(g: {
    _id: Id<"games">;
    title: string;
    slug: string;
    thumbnailUrl: string | null;
    imageUrl: string | null;
  }) {
    if (added.has(g._id)) return;
    if (atCap) {
      toast(`That's the maximum of ${size + HM_DRAFT_MAX} games.`, "info");
      return;
    }
    touched.current = true;
    setRows((r) => [
      ...r,
      {
        gameId: g._id,
        title: g.title,
        thumbUrl: g.thumbnailUrl ?? g.imageUrl ?? null,
        slug: g.slug,
      },
    ]);
  }

  function removeGame(gameId: Id<"games">) {
    touched.current = true;
    setRows((r) => r.filter((x) => x.gameId !== gameId));
  }

  async function saveName() {
    const trimmed = name.trim();
    if ((title ?? "") === trimmed) return;
    await renameList({ id: listId, title: trimmed });
  }

  async function onFinalize() {
    if (rows.length === 0) {
      toast("Add at least one game first.", "info");
      return;
    }
    const keptHm = Math.min(hmCount, HM_KEPT);
    const hmNote =
      hmCount > 0
        ? ` Your top ${keptHm} honorable mention${keptHm === 1 ? "" : "s"} will be kept${
            hmCount > HM_KEPT ? `; the other ${hmCount - HM_KEPT} will be dropped` : ""
          }.`
        : "";
    const ok = await confirm({
      title: "Finalize this list?",
      message: `This stamps your ${previewTitle} for good.${hmNote} You can reopen it later to make changes.`,
      confirmText: "Finalize",
    });
    if (!ok) return;
    try {
      await setEntries({ id: listId, gameIds: rows.map((r) => r.gameId) });
      await finalizeList({ id: listId });
      toast("List finalized 🎉", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't finalize.", "error");
    }
  }

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_20rem]">
      {/* Ranked list */}
      <div className="order-2 min-w-0 lg:order-1">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="Name this list — e.g. 2-player games"
            className="h-10 w-full sm:w-auto sm:max-w-xs sm:flex-1"
            aria-label="List name"
          />
          <span className="text-sm font-semibold tabular-nums text-muted">
            <span className={cn(mainCount === size && "text-accent")}>
              {mainCount}/{size}
            </span>
            {hmCount > 0 && (
              <span className="text-accent-2"> · {hmCount} honorable</span>
            )}
          </span>
          <SaveBadge state={saveState} />
          <button
            onClick={onFinalize}
            className={buttonClasses("primary", "sm", "ml-auto")}
          >
            <Check className="h-4 w-4" />
            Finalize
          </button>
        </div>

        {name.trim() && (
          <p className="mb-4 -mt-1 px-1 text-xs text-muted">
            Shows as{" "}
            <span className="font-semibold text-foreground">{previewTitle}</span>
          </p>
        )}

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
            <p className="font-medium">No games yet.</p>
            <p className="mt-1 text-sm">
              Find games with the search, then drag to rank.
            </p>
          </div>
        ) : (
          <div className="relative">
            <ul
              ref={containerRef}
              className={cn("space-y-2", dragging && "select-none")}
            >
              {rows.map((row, i) => {
                const isHM = i >= size;
                return (
                  <li
                    key={row.gameId}
                    style={rowStyle(i)}
                    className={cn(
                      "flex items-center gap-2 rounded-2xl border p-2 pr-3",
                      dragIndex === i
                        ? "border-accent/60 bg-surface shadow-xl"
                        : cn(
                            "transition-shadow",
                            isHM
                              ? "border-border/70 bg-surface-2/50"
                              : "border-border bg-surface",
                          ),
                    )}
                  >
                    <button
                      {...handleProps(i)}
                      aria-label="Drag to reorder"
                      className="flex h-10 w-7 shrink-0 items-center justify-center rounded-lg text-subtle hover:bg-surface-2 hover:text-muted"
                    >
                      <GripVertical className="h-5 w-5" />
                    </button>
                    <span className="flex w-7 shrink-0 items-center justify-center text-sm font-bold tabular-nums text-muted">
                      {isHM ? (
                        <Star className="h-4 w-4 text-accent-2" />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <Thumb url={row.thumbUrl} className="h-11 w-11" />
                    <span
                      className={cn(
                        "font-display min-w-0 flex-1 truncate font-bold",
                        isHM && "text-muted",
                      )}
                    >
                      {row.title}
                    </span>
                    <button
                      onClick={() => removeGame(row.gameId)}
                      aria-label={`Remove ${row.title}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-red-500/10 hover:text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* The cut line — games below it become honorable mentions. */}
            {overSize && pitch > 0 && (
              <div
                className="pointer-events-none absolute inset-x-0 z-20 flex -translate-y-1/2 items-center"
                style={{ top: size * pitch - 4 }}
              >
                <div className="h-px flex-1 bg-accent/40" />
                <span className="mx-2 inline-flex items-center gap-1 rounded-full border border-accent/40 bg-background px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">
                  <Star className="h-3 w-3" />
                  Honorable mentions
                </span>
                <div className="h-px flex-1 bg-accent/40" />
              </div>
            )}
          </div>
        )}

        {overSize && (
          <p className="mt-3 text-xs text-subtle">
            Below the line are honorable mentions — your top {HM_KEPT} are kept
            when you finalize.
          </p>
        )}
      </div>

      {/* Add panel */}
      <AddPanel
        added={added}
        atCap={atCap}
        overSize={overSize}
        size={size}
        onAdd={addGame}
      />
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const label =
    state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save failed";
  return (
    <span
      className={cn(
        "text-xs font-medium",
        state === "error" ? "text-red-500" : "text-subtle",
      )}
    >
      {label}
    </span>
  );
}

function AddPanel({
  added,
  atCap,
  overSize,
  size,
  onAdd,
}: {
  added: Set<Id<"games">>;
  atCap: boolean;
  overSize: boolean;
  size: number;
  onAdd: (g: {
    _id: Id<"games">;
    title: string;
    slug: string;
    thumbnailUrl: string | null;
    imageUrl: string | null;
  }) => void;
}) {
  const { term, setTerm, results, status, loadMore, bggResults, bggPending } =
    useGameSearch(20);
  const importGame = useAction(api.images.importGame);
  const toast = useToast();
  const [importingId, setImportingId] = useState<string | null>(null);

  async function addFromBgg(h: {
    bggId: string;
    name: string;
    year: string | null;
  }) {
    if (atCap) {
      toast(`That's the maximum number of games.`, "info");
      return;
    }
    setImportingId(h.bggId);
    try {
      const { gameId, slug } = await importGame({
        bggId: h.bggId,
        title: h.name,
      });
      onAdd({
        _id: gameId,
        title: h.name,
        slug,
        thumbnailUrl: null,
        imageUrl: null,
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add that game.", "error");
    } finally {
      setImportingId(null);
    }
  }

  return (
    <div className="order-1 min-w-0 lg:order-2 lg:sticky lg:top-20 lg:self-start">
      <div className="rounded-2xl border border-border bg-surface p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search games to add…"
            className="pl-9"
            aria-label="Search games"
          />
        </div>
        {atCap ? (
          <p className="mt-2 text-xs text-accent">
            Maximum reached — remove a game to add another.
          </p>
        ) : overSize ? (
          <p className="mt-2 text-xs text-accent-2">
            Your Top {size} is full — new picks land in honorable mentions.
          </p>
        ) : null}
        <ul className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto">
          {results.map((g) => {
            const isAdded = added.has(g._id);
            return (
              <li key={g._id}>
                <button
                  onClick={() => onAdd(g)}
                  disabled={isAdded || atCap}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl p-1.5 text-left transition-colors",
                    isAdded || atCap ? "opacity-50" : "hover:bg-surface-2",
                  )}
                >
                  <Thumb url={g.thumbnailUrl ?? g.imageUrl} className="h-9 w-9" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {g.title}
                    {g.year ? (
                      <span className="ml-1 text-xs text-subtle">{g.year}</span>
                    ) : null}
                  </span>
                  {isAdded ? (
                    <Check className="h-4 w-4 shrink-0 text-accent-2" />
                  ) : (
                    <Plus className="h-4 w-4 shrink-0 text-subtle" />
                  )}
                </button>
              </li>
            );
          })}
          {status === "CanLoadMore" && (
            <li>
              <button
                onClick={loadMore}
                className="w-full rounded-xl py-2 text-sm font-medium text-muted hover:bg-surface-2"
              >
                Load more
              </button>
            </li>
          )}

          {/* Games we don't have yet — imported (and saved) on click. */}
          {bggResults.map((h) => {
            const busy = importingId === h.bggId;
            return (
              <li key={h.bggId}>
                <button
                  onClick={() => addFromBgg(h)}
                  disabled={busy || atCap || importingId != null}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl p-1.5 text-left transition-colors",
                    atCap ? "opacity-50" : "hover:bg-surface-2",
                  )}
                >
                  <Thumb url={h.thumbUrl} className="h-9 w-9" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {h.name}
                    {h.year ? (
                      <span className="ml-1 text-xs text-subtle">{h.year}</span>
                    ) : null}
                  </span>
                  {busy ? (
                    <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  ) : (
                    <Plus className="h-4 w-4 shrink-0 text-subtle" />
                  )}
                </button>
              </li>
            );
          })}

          {results.length === 0 &&
            bggResults.length === 0 &&
            status !== "LoadingFirstPage" && (
              <li className="px-2 py-6 text-center text-sm text-subtle">
                {bggPending ? "Searching…" : "No games found."}
              </li>
            )}
        </ul>
      </div>
    </div>
  );
}
