"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";

type Row = { id: number; item: string; count: number };

/** Admin editor for a game's "In the box" component list (fix the AI's output). */
export function ComponentsEditor({ gameId }: { gameId: Id<"games"> }) {
  const data = useQuery(api.glossary.componentsForGame, { gameId });
  const save = useMutation(api.glossary.adminSaveComponents);
  const regenerate = useAction(api.glossary.adminRegenerate);
  const toast = useToast();

  const idRef = useRef(0);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  // Initialise (and re-initialise after an AI regenerate) from the query.
  useEffect(() => {
    if (rows !== null || data === undefined) return;
    setRows(
      (data?.items ?? []).map((c) => ({
        id: idRef.current++,
        item: c.item,
        count: c.count,
      })),
    );
  }, [data, rows]);

  if (rows === null) return <p className="text-sm text-muted">Loading…</p>;

  const update = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs!.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: number) =>
    setRows((rs) => rs!.filter((r) => r.id !== id));
  const add = () =>
    setRows((rs) => [...(rs ?? []), { id: idRef.current++, item: "", count: 1 }]);

  async function onSave() {
    setSaving(true);
    try {
      await save({
        gameId,
        components: rows!
          .filter((r) => r.item.trim())
          .map((r) => ({ item: r.item.trim(), count: r.count })),
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

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted">
            No components yet — add them, or regenerate from the rulebook.
          </p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <input
              value={r.item}
              onChange={(e) => update(r.id, { item: e.target.value })}
              placeholder="Item (e.g. Wooden meeple)"
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="number"
              min={1}
              value={r.count}
              onChange={(e) =>
                update(r.id, {
                  count: Math.max(1, Math.round(Number(e.target.value) || 1)),
                })
              }
              aria-label="Quantity"
              className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => remove(r.id)}
              aria-label="Remove component"
              className="rounded-md p-2 text-subtle transition-colors hover:bg-surface-2 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={add}
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
