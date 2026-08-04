"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";
import { friendlyError } from "@/lib/friendlyError";

const PencilIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export function CoverUploader({
  gameId,
  imageUrl,
}: {
  gameId: Id<"games">;
  imageUrl: string | null;
}) {
  const setCoverFromUrl = useAction(api.images.setGameCoverFromUrl);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await setCoverFromUrl({ gameId, url: trimmed });
      setUrl("");
      setEditing(false);
      toast("Cover updated", "success");
    } catch (e) {
      setError(friendlyError(e, "Couldn't set the cover from that URL."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Current cover with an edit affordance in the corner. */}
      <div className="relative mx-auto w-fit">
        <div className="h-32 w-32 overflow-hidden rounded-xl border border-border bg-surface-2 shadow-sm">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="Cover" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl opacity-40">
              🎲
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-label={editing ? "Cancel editing cover" : "Change cover"}
          aria-expanded={editing}
          className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-md transition-colors hover:bg-surface-2"
        >
          {PencilIcon}
        </button>
      </div>

      {/* Reveal-on-edit URL input. */}
      {editing && (
        <div className="mx-auto mt-4 max-w-md rounded-xl border border-border bg-surface-2/50 p-3">
          <label htmlFor="cover-url" className="mb-1.5 block text-sm font-medium">
            Cover image URL
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="cover-url"
              type="url"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSave();
                }
              }}
              placeholder="https://…/cover.jpg"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || !url.trim()}
              className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Fetch & save"}
            </button>
          </div>
          {error && (
            <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <p className="mt-1.5 text-xs text-muted">
            Paste an image link — it&apos;s downloaded, compressed, and stored.
          </p>
        </div>
      )}
    </div>
  );
}
