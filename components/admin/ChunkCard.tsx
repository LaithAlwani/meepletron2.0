"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

export function ChunkCard({ chunk }: { chunk: Doc<"draftChunks"> }) {
  const update = useMutation(api.ingestionDb.updateDraftChunk);
  const [text, setText] = useState(chunk.text);
  const [saving, setSaving] = useState(false);
  const dirty = text !== chunk.text;

  async function save() {
    setSaving(true);
    try {
      await update({ draftChunkId: chunk._id, text });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`rounded-lg border p-3 ${
        chunk.accepted
          ? "border-border bg-surface"
          : "border-dashed border-border bg-surface-2 opacity-60"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-muted">
          {chunk.breadcrumb || "(no breadcrumb)"}
        </span>
        {chunk.page && <span className="text-muted">p.{chunk.page}</span>}
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">
          {chunk.chunkType}
        </span>
        {chunk.scope === "variant" && (
          <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-purple-600 dark:text-purple-400">
            {chunk.variantName ?? "variant"}
          </span>
        )}
        {chunk.flags.map((f) => (
          <span
            key={f}
            className="rounded-full bg-red-500/15 px-2 py-0.5 text-red-600 dark:text-red-400"
          >
            {f}
          </span>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(10, Math.max(2, Math.ceil(text.length / 80)))}
        className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="mt-2 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={chunk.accepted}
            onChange={(e) =>
              void update({ draftChunkId: chunk._id, accepted: e.target.checked })
            }
            className="accent-[var(--accent)]"
          />
          Include this chunk
        </label>
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
  );
}
