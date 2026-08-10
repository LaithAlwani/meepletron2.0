"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Plus, Trash2 } from "lucide-react";

/** Inline form to insert a brand-new chunk (at top, or after a given chunk). */
export function InsertChunkForm({
  rulebookId,
  afterChunkId,
  defaultBreadcrumb = "",
  defaultPage,
  onDone,
}: {
  rulebookId: Id<"rulebooks">;
  afterChunkId?: Id<"draftChunks">;
  defaultBreadcrumb?: string;
  defaultPage?: number;
  onDone: () => void;
}) {
  const insert = useMutation(api.ingestionDb.insertDraftChunk);
  const [breadcrumb, setBreadcrumb] = useState(defaultBreadcrumb);
  const [text, setText] = useState("");
  const [page, setPage] = useState(defaultPage ? String(defaultPage) : "");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const parsedPage = page.trim() ? Number(page) : undefined;
      await insert({
        rulebookId,
        afterChunkId,
        breadcrumb: breadcrumb.trim(),
        text: text.trim(),
        page: Number.isFinite(parsedPage) ? parsedPage : undefined,
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-dashed border-accent/50 bg-accent/5 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">
        New chunk {afterChunkId ? "here" : "at top"}
      </p>
      <div className="mb-2 flex gap-2">
        <input
          value={breadcrumb}
          onChange={(e) => setBreadcrumb(e.target.value)}
          placeholder="Breadcrumb / section path"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={page}
          onChange={(e) => setPage(e.target.value)}
          placeholder="p."
          inputMode="numeric"
          className="w-16 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Chunk text the AI missed…"
        className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={add}
          disabled={saving || !text.trim()}
          className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-subtle"
        >
          {saving ? "Adding…" : "Add chunk"}
        </button>
        <button
          onClick={onDone}
          className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-surface-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ChunkCard({
  chunk,
  rulebookId,
}: {
  chunk: Doc<"draftChunks">;
  rulebookId: Id<"rulebooks">;
}) {
  const update = useMutation(api.ingestionDb.updateDraftChunk);
  const remove = useMutation(api.ingestionDb.deleteDraftChunk);
  const [text, setText] = useState(chunk.text);
  const [breadcrumb, setBreadcrumb] = useState(chunk.breadcrumb);
  const [saving, setSaving] = useState(false);
  const [inserting, setInserting] = useState(false);
  const dirty = text !== chunk.text || breadcrumb !== chunk.breadcrumb;

  async function save() {
    setSaving(true);
    try {
      await update({ draftChunkId: chunk._id, text, breadcrumb });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this chunk? This can't be undone.")) return;
    await remove({ draftChunkId: chunk._id });
  }

  return (
    <div
      id={`chunk-${chunk.order}`}
      className={`scroll-mt-4 rounded-lg border p-3 ${
        chunk.accepted
          ? "border-border bg-surface"
          : "border-dashed border-border bg-surface-2 opacity-70"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <input
          value={breadcrumb}
          onChange={(e) => setBreadcrumb(e.target.value)}
          placeholder="(no breadcrumb)"
          title="Section breadcrumb — edit to fix the AI's grouping"
          className="min-w-40 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 font-medium text-muted outline-none hover:border-border focus:border-border focus:bg-background focus:ring-2 focus:ring-ring"
        />
        {chunk.page != null && (
          <span className="shrink-0 text-muted">p.{chunk.page}</span>
        )}
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-muted">
          {chunk.chunkType}
        </span>
        {chunk.edited && (
          <span className="shrink-0 rounded-full bg-accent-2/15 px-2 py-0.5 text-accent-2">
            edited
          </span>
        )}
        {chunk.scope === "variant" && (
          <span className="shrink-0 rounded-full bg-purple-500/15 px-2 py-0.5 text-purple-600 dark:text-purple-400">
            {chunk.variantName ?? "variant"}
          </span>
        )}
        {chunk.flags.map((f) => (
          <span
            key={f}
            className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-red-600 dark:text-red-400"
          >
            {f}
          </span>
        ))}
        <button
          onClick={handleDelete}
          title="Delete chunk"
          className="ml-auto shrink-0 rounded-md p-1 text-subtle transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(10, Math.max(2, Math.ceil(text.length / 80)))}
        className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={chunk.accepted}
            onChange={(e) =>
              void update({
                draftChunkId: chunk._id,
                accepted: e.target.checked,
              })
            }
            className="accent-[var(--accent)]"
          />
          Include this chunk
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInserting((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Insert below
          </button>
          {dirty && (
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save edit"}
            </button>
          )}
        </div>
      </div>

      {inserting && (
        <InsertChunkForm
          rulebookId={rulebookId}
          afterChunkId={chunk._id}
          defaultBreadcrumb={breadcrumb}
          defaultPage={chunk.page}
          onDone={() => setInserting(false)}
        />
      )}
    </div>
  );
}
