"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";

type Row = { id: number; label: string; detail: string };

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";

/** Admin editor for a game's "Rules refresher" list (fix the AI's output). */
export function RemindersEditor({ gameId }: { gameId: Id<"games"> }) {
  const data = useQuery(api.reminders.listForGame, { gameId });
  const save = useMutation(api.reminders.adminSaveReminders);
  const regenerate = useAction(api.reminders.adminRegenerate);
  const toast = useToast();

  const idRef = useRef(0);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (rows !== null || data === undefined) return;
    setRows(
      data.map((r) => ({ id: idRef.current++, label: r.label, detail: r.detail })),
    );
  }, [data, rows]);

  if (rows === null) return <p className="text-sm text-muted">Loading…</p>;

  const update = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs!.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: number) =>
    setRows((rs) => rs!.filter((r) => r.id !== id));
  const add = () =>
    setRows((rs) => [...(rs ?? []), { id: idRef.current++, label: "", detail: "" }]);

  async function onSave() {
    setSaving(true);
    try {
      await save({
        gameId,
        reminders: rows!
          .filter((r) => r.label.trim() && r.detail.trim())
          .map((r) => ({ label: r.label.trim(), detail: r.detail.trim() })),
      });
      toast("Rules refresher saved", "success");
    } catch {
      toast("Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function onRegenerate() {
    setBusy(true);
    try {
      await regenerate({ gameId });
      setRows(null);
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
            Nothing yet — add reminders, or regenerate from the rulebook.
          </p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex items-start gap-2">
            <input
              value={r.label}
              onChange={(e) => update(r.id, { label: e.target.value })}
              placeholder="Label (e.g. Starting money)"
              className={`${inputClass} w-44 shrink-0 font-medium`}
            />
            <textarea
              value={r.detail}
              onChange={(e) => update(r.id, { detail: e.target.value })}
              placeholder="The specific rule…"
              rows={2}
              className={`${inputClass} flex-1 resize-y`}
            />
            <button
              onClick={() => remove(r.id)}
              aria-label="Remove"
              className="mt-1 rounded-md p-2 text-subtle transition-colors hover:bg-surface-2 hover:text-red-600"
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
          Add reminder
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
          {saving ? "Saving…" : "Save reminders"}
        </button>
      </div>
    </div>
  );
}
