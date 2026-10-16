"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { Plus, Trash2, Sparkles, GripVertical } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";
import { useUnsavedForm } from "@/components/admin/UnsavedGuard";

type Child = { id: number; item: string; count: number };
type Row = { id: number; item: string; count: number; children: Child[] };

type Src =
  | { kind: "row"; rowId: number }
  | { kind: "child"; rowId: number; childId: number };
type Drop =
  | { kind: "row-before"; rowId: number }
  | { kind: "row-after"; rowId: number }
  | { kind: "row-into"; rowId: number }
  | { kind: "child-before"; rowId: number; childId: number }
  | { kind: "child-after"; rowId: number; childId: number };

/** A row's shown count: the sum of its sub-items, or its own count when it's a
 *  plain leaf. A parent total is always its breakdown added up. */
function rowCount(r: Row): number {
  return r.children.length
    ? r.children.reduce((s, c) => s + c.count, 0)
    : r.count;
}

/** Pure: move the dragged node to the drop position. Nesting is one level deep —
 *  a leaf (or a sub-item) can drop into a row to become its sub-item; a sub-item
 *  can drop out to the top level to be promoted back. Cancels (returns the list
 *  unchanged) if the target no longer exists after the source is removed. */
function applyMove(rows: Row[], src: Src, drop: Drop): Row[] {
  let movedRow: Row | null = null;
  let movedChild: Child | null = null;
  let working: Row[];
  if (src.kind === "row") {
    movedRow = rows.find((r) => r.id === src.rowId) ?? null;
    working = rows.filter((r) => r.id !== src.rowId);
  } else {
    const parent = rows.find((r) => r.id === src.rowId);
    movedChild = parent?.children.find((c) => c.id === src.childId) ?? null;
    working = rows.map((r) =>
      r.id === src.rowId
        ? { ...r, children: r.children.filter((c) => c.id !== src.childId) }
        : r,
    );
  }
  if (!movedRow && !movedChild) return rows;

  const asRow = (): Row =>
    movedRow ?? {
      id: movedChild!.id,
      item: movedChild!.item,
      count: movedChild!.count,
      children: [],
    };
  const asChild = (): Child =>
    movedChild ?? {
      id: movedRow!.id,
      item: movedRow!.item,
      count: movedRow!.count,
    };

  if (drop.kind === "row-before" || drop.kind === "row-after") {
    const idx = working.findIndex((r) => r.id === drop.rowId);
    if (idx === -1) return rows;
    const at = drop.kind === "row-before" ? idx : idx + 1;
    return [...working.slice(0, at), asRow(), ...working.slice(at)];
  }
  if (drop.kind === "row-into") {
    if (!working.some((r) => r.id === drop.rowId)) return rows;
    const child = asChild();
    return working.map((r) =>
      r.id === drop.rowId ? { ...r, children: [...r.children, child] } : r,
    );
  }
  // child-before / child-after
  if (!working.some((r) => r.id === drop.rowId)) return rows;
  const child = asChild();
  return working.map((r) => {
    if (r.id !== drop.rowId) return r;
    const ci = r.children.findIndex((c) => c.id === drop.childId);
    const at =
      ci === -1
        ? r.children.length
        : drop.kind === "child-before"
          ? ci
          : ci + 1;
    return {
      ...r,
      children: [...r.children.slice(0, at), child, ...r.children.slice(at)],
    };
  });
}

/** Admin editor for a game's "In the box" component list (fix the AI's output).
 *  Supports one level of nesting: drag the handle to reorder, drop an item onto
 *  another to make it a sub-item, or drag a sub-item out to promote it. Drag is
 *  driven by Pointer Events so it works with both a mouse and touch. */
export function ComponentsEditor({ gameId }: { gameId: Id<"games"> }) {
  const data = useQuery(api.glossary.componentsForGame, { gameId });
  const save = useMutation(api.glossary.adminSaveComponents);
  const regenerate = useAction(api.glossary.adminRegenerate);
  const toast = useToast();

  const idRef = useRef(0);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const dragRef = useRef<Src | null>(null);
  const [src, setSrc] = useState<Src | null>(null); // mirrors dragRef for styling
  const [drop, setDrop] = useState<Drop | null>(null);

  // Initialise (and re-initialise after an AI regenerate) from the query.
  useEffect(() => {
    if (rows !== null || data === undefined) return;
    setRows(
      (data?.items ?? []).map((c) => ({
        id: idRef.current++,
        item: c.item,
        count: c.count,
        children: c.children.map((ch) => ({
          id: idRef.current++,
          item: ch.item,
          count: ch.count,
        })),
      })),
    );
  }, [data, rows]);

  const dirty =
    rows !== null &&
    JSON.stringify(
      rows
        .filter((r) => r.item.trim())
        .map((r) => ({
          item: r.item.trim(),
          count: rowCount(r),
          children: r.children
            .filter((c) => c.item.trim())
            .map((c) => ({ item: c.item.trim(), count: c.count })),
        })),
    ) !==
      JSON.stringify(
        (data?.items ?? []).map((c) => ({
          item: c.item,
          count: c.count,
          children: c.children.map((ch) => ({
            item: ch.item,
            count: ch.count,
          })),
        })),
      );
  useUnsavedForm("components", dirty, onSave);

  if (rows === null) return <p className="text-sm text-muted">Loading…</p>;

  const set = (fn: (rs: Row[]) => Row[]) => setRows((rs) => fn(rs!));
  const updateRow = (id: number, patch: Partial<Row>) =>
    set((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: number) => set((rs) => rs.filter((r) => r.id !== id));
  const addRow = () =>
    set((rs) => [
      ...rs,
      { id: idRef.current++, item: "", count: 1, children: [] },
    ]);
  const addChild = (rowId: number) =>
    set((rs) =>
      rs.map((r) =>
        r.id === rowId
          ? {
              ...r,
              children: [
                ...r.children,
                { id: idRef.current++, item: "", count: 1 },
              ],
            }
          : r,
      ),
    );
  const updateChild = (rowId: number, childId: number, patch: Partial<Child>) =>
    set((rs) =>
      rs.map((r) =>
        r.id === rowId
          ? {
              ...r,
              children: r.children.map((c) =>
                c.id === childId ? { ...c, ...patch } : c,
              ),
            }
          : r,
      ),
    );
  const removeChild = (rowId: number, childId: number) =>
    set((rs) =>
      rs.map((r) =>
        r.id === rowId
          ? { ...r, children: r.children.filter((c) => c.id !== childId) }
          : r,
      ),
    );

  // --- pointer-driven drag (works for mouse + touch) ---
  // Figure out the drop position under the pointer by hit-testing the DOM for
  // the nearest row/sub-item (tagged with data-* attributes) and the pointer's
  // vertical position within it (top → before, bottom → after, middle → nest).
  const dropAt = (clientX: number, clientY: number): Drop | null => {
    const s = dragRef.current;
    if (!s) return null;
    const el = document.elementFromPoint(clientX, clientY);
    const childEl = el?.closest<HTMLElement>("[data-child-id]");
    if (childEl) {
      const rect = childEl.getBoundingClientRect();
      const after = clientY - rect.top >= rect.height / 2;
      return {
        kind: after ? "child-after" : "child-before",
        rowId: Number(childEl.dataset.parentId),
        childId: Number(childEl.dataset.childId),
      };
    }
    const rowEl = el?.closest<HTMLElement>("[data-row-id]");
    if (rowEl) {
      const rowId = Number(rowEl.dataset.rowId);
      const rect = rowEl.getBoundingClientRect();
      const y = clientY - rect.top;
      const srcRow = s.kind === "row" ? rows.find((r) => r.id === s.rowId) : null;
      // Only a leaf row or a sub-item can nest in (keeps it one level deep).
      const canInto = s.kind === "child" || srcRow?.children.length === 0;
      const sameRow = s.kind === "row" && s.rowId === rowId;
      const into =
        !!canInto && !sameRow && y > rect.height * 0.3 && y < rect.height * 0.7;
      return {
        kind: into
          ? "row-into"
          : y < rect.height / 2
            ? "row-before"
            : "row-after",
        rowId,
      };
    }
    return null;
  };

  const startDrag = (e: React.PointerEvent, s: Src) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = s;
    setSrc(s);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setDrop(dropAt(e.clientX, e.clientY));
  };
  const endDrag = (e: React.PointerEvent, apply: boolean) => {
    const s = dragRef.current;
    if (!s) return;
    const d = apply ? dropAt(e.clientX, e.clientY) : null;
    dragRef.current = null;
    setSrc(null);
    setDrop(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be gone */
    }
    if (d) set((rs) => applyMove(rs, s, d));
  };

  const gripHandlers = (s: Src) => ({
    onPointerDown: (e: React.PointerEvent) => startDrag(e, s),
    onPointerMove: onDragMove,
    onPointerUp: (e: React.PointerEvent) => endDrag(e, true),
    onPointerCancel: (e: React.PointerEvent) => endDrag(e, false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(), // no long-press menu
  });

  const rowDropCls = (rowId: number) => {
    if (!drop || drop.rowId !== rowId) return "";
    if (drop.kind === "row-before") return "border-t-2 border-t-accent";
    if (drop.kind === "row-after") return "border-b-2 border-b-accent";
    if (drop.kind === "row-into") return "ring-2 ring-accent ring-inset";
    return "";
  };
  const childDropCls = (rowId: number, childId: number) => {
    if (drop?.kind !== "child-before" && drop?.kind !== "child-after") return "";
    if (drop.rowId !== rowId || drop.childId !== childId) return "";
    return drop.kind === "child-before"
      ? "border-t-2 border-t-accent"
      : "border-b-2 border-b-accent";
  };
  const rowDim = (rowId: number) =>
    src?.kind === "row" && src.rowId === rowId ? "opacity-50" : "";
  const childDim = (rowId: number, childId: number) =>
    src?.kind === "child" && src.rowId === rowId && src.childId === childId
      ? "opacity-50"
      : "";

  async function onSave() {
    setSaving(true);
    try {
      await save({
        gameId,
        components: rows!
          .filter((r) => r.item.trim())
          .map((r) => ({
            item: r.item.trim(),
            // Parent total = sum of sub-items; the server enforces this too.
            count: rowCount(r),
            children: r.children.length
              ? r.children
                  .filter((c) => c.item.trim())
                  .map((c) => ({ item: c.item.trim(), count: c.count }))
              : undefined,
          })),
      });
      toast("Components saved", "success");
    } catch {
      toast("Couldn't save components", "error");
    } finally {
      setSaving(false);
    }
  }

  async function onRegenerate() {
    setBusy(true);
    try {
      await regenerate({ gameId });
      setRows(null); // re-init from the freshly generated list
      toast("Regenerated from the rulebook", "success");
    } catch {
      toast("Regenerate failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";
  const countCls =
    "w-20 shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";
  const gripCls =
    "shrink-0 cursor-grab touch-none select-none text-subtle hover:text-foreground active:cursor-grabbing";

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Drag the handle to reorder. Drop an item onto another to make it a
        sub-item; drag a sub-item out to promote it. A parent&apos;s quantity is
        the sum of its sub-items.
      </p>

      <div className="space-y-1.5">
        {rows.length === 0 && (
          <p className="text-sm text-muted">
            No components yet — add them, or regenerate from the rulebook.
          </p>
        )}

        {rows.map((r) => (
          <div key={r.id} className="space-y-1.5">
            {/* Top-level row */}
            <div
              data-row-id={r.id}
              className={`flex items-center gap-2 rounded-md ${rowDropCls(r.id)} ${rowDim(r.id)}`}
            >
              <span
                {...gripHandlers({ kind: "row", rowId: r.id })}
                aria-label="Drag to reorder or nest"
                className={gripCls}
              >
                <GripVertical className="h-4 w-4" />
              </span>
              <input
                value={r.item}
                onChange={(e) => updateRow(r.id, { item: e.target.value })}
                placeholder="Item (e.g. Player cards)"
                className={inputCls}
              />
              <input
                type="number"
                min={1}
                value={rowCount(r)}
                disabled={r.children.length > 0}
                onChange={(e) =>
                  updateRow(r.id, {
                    count: Math.max(1, Math.round(Number(e.target.value) || 1)),
                  })
                }
                aria-label="Quantity"
                title={
                  r.children.length > 0
                    ? "Total of the sub-items below"
                    : "Quantity"
                }
                className={`${countCls} ${r.children.length > 0 ? "opacity-50" : ""}`}
              />
              <button
                onClick={() => addChild(r.id)}
                aria-label="Add sub-item"
                title="Add sub-item"
                className="shrink-0 rounded-md p-2 text-subtle transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={() => removeRow(r.id)}
                aria-label="Remove component"
                className="shrink-0 rounded-md p-2 text-subtle transition-colors hover:bg-surface-2 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {/* Sub-items */}
            {r.children.length > 0 && (
              <div className="ml-7 space-y-1.5 border-l border-border-muted pl-3">
                {r.children.map((c) => (
                  <div
                    key={c.id}
                    data-child-id={c.id}
                    data-parent-id={r.id}
                    className={`flex items-center gap-2 rounded-md ${childDropCls(r.id, c.id)} ${childDim(r.id, c.id)}`}
                  >
                    <span
                      {...gripHandlers({
                        kind: "child",
                        rowId: r.id,
                        childId: c.id,
                      })}
                      aria-label="Drag to reorder or promote"
                      className={gripCls}
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <input
                      value={c.item}
                      onChange={(e) =>
                        updateChild(r.id, c.id, { item: e.target.value })
                      }
                      placeholder="Sub-item (e.g. Starting cards)"
                      className={inputCls}
                    />
                    <input
                      type="number"
                      min={1}
                      value={c.count}
                      onChange={(e) =>
                        updateChild(r.id, c.id, {
                          count: Math.max(
                            1,
                            Math.round(Number(e.target.value) || 1),
                          ),
                        })
                      }
                      aria-label="Quantity"
                      className={countCls}
                    />
                    <button
                      onClick={() => removeChild(r.id, c.id)}
                      aria-label="Remove sub-item"
                      className="shrink-0 rounded-md p-2 text-subtle transition-colors hover:bg-surface-2 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={addRow}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Add component
        </button>
        <button
          onClick={onRegenerate}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {busy ? "Regenerating…" : "Regenerate with AI"}
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="ml-auto rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save components"}
        </button>
      </div>
    </div>
  );
}
