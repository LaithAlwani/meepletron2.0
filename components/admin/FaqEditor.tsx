"use client";

import { buttonClasses } from "@/components/ui/buttonStyles";
import { fieldClasses } from "@/components/ui/Field";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";
import { useUnsavedForm } from "@/components/admin/UnsavedGuard";

type Row = {
  id: number;
  faqId?: Id<"gameFaqs">;
  question: string;
  answer: string;
};

const inputBase = `${fieldClasses} !w-auto px-3 py-1.5`;

/**
 * Admin editor for a game's FAQ (fix the AI's output). Editing an answer clears
 * its citations (they'd no longer match).
 */
export function FaqEditor({
  gameId,
  onDone,
}: {
  gameId: Id<"games">;
  onDone?: () => void;
}) {
  const data = useQuery(api.faqs.listForGame, { gameId });
  const save = useMutation(api.faqs.adminSaveFaqs);
  const regenerate = useAction(api.faqs.adminRegenerate);
  const toast = useToast();

  const idRef = useRef(0);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (rows !== null || data === undefined) return;
    setRows(
      data.map((f) => ({
        id: idRef.current++,
        faqId: f._id,
        question: f.question,
        answer: f.answer,
      })),
    );
  }, [data, rows]);

  const dirty =
    rows !== null &&
    JSON.stringify(
      rows
        .filter((r) => r.question.trim() && r.answer.trim())
        .map((r) => ({ q: r.question.trim(), a: r.answer.trim() })),
    ) !==
      JSON.stringify((data ?? []).map((f) => ({ q: f.question, a: f.answer })));
  useUnsavedForm("faq", dirty, onSave);

  if (rows === null) return <p className="text-sm text-muted">Loading…</p>;

  const update = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs!.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: number) =>
    setRows((rs) => rs!.filter((r) => r.id !== id));
  const add = () =>
    setRows((rs) => [
      ...(rs ?? []),
      { id: idRef.current++, question: "", answer: "" },
    ]);

  async function onSave() {
    setSaving(true);
    try {
      await save({
        gameId,
        faqs: rows!
          .filter((r) => r.question.trim() && r.answer.trim())
          .map((r) => ({
            id: r.faqId,
            question: r.question.trim(),
            answer: r.answer.trim(),
          })),
      });
      toast("FAQ saved", "success");
      onDone?.();
    } catch {
      toast("Couldn't save FAQ", "error");
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
            No questions yet — add some, or regenerate from the rulebook.
          </p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <input
                value={r.question}
                onChange={(e) => update(r.id, { question: e.target.value })}
                placeholder="Question"
                className={`${inputBase} flex-1 font-semibold`}
              />
              <button
                onClick={() => remove(r.id)}
                aria-label="Remove question"
                className="shrink-0 rounded-lg p-2 text-subtle transition-colors hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={r.answer}
              onChange={(e) => update(r.id, { answer: e.target.value })}
              placeholder="Answer"
              rows={3}
              className={`${inputBase} w-full resize-y`}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={add}
          className={buttonClasses("ghost", "sm")}
        >
          <Plus className="h-4 w-4" />
          Add question
        </button>
        <button
          onClick={onRegenerate}
          disabled={busy}
          className={buttonClasses("ghost", "sm")}
        >
          <Sparkles className="h-4 w-4" />
          {busy ? "Regenerating…" : "Regenerate with AI"}
        </button>
        {onDone && (
          <button
            onClick={onDone}
            className={buttonClasses("ghost", "sm", "ml-auto")}
          >
            Cancel
          </button>
        )}
        <button
          onClick={onSave}
          disabled={saving}
          className={`${onDone ? "" : "ml-auto "}rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50`}
        >
          {saving ? "Saving…" : "Save FAQ"}
        </button>
      </div>
    </div>
  );
}
