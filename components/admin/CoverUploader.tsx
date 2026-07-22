"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function CoverUploader({
  gameId,
  imageUrl,
}: {
  gameId: Id<"games">;
  imageUrl: string | null;
}) {
  const setCoverFromUrl = useAction(api.images.setGameCoverFromUrl);
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
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't set the cover from that URL",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-2">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="Cover" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl opacity-40">
            🎲
          </div>
        )}
      </div>

      <div className="flex-1">
        <label htmlFor="cover-url" className="mb-1 block text-sm font-medium">
          Cover image URL
        </label>
        <div className="flex gap-2">
          <input
            id="cover-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSave();
              }
            }}
            placeholder="https://…/cover.jpg"
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !url.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Fetch & save"}
          </button>
        </div>
        {error && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <p className="mt-1 text-xs text-muted">
          Paste an image link — it&apos;s downloaded, compressed, and stored.
        </p>
      </div>
    </div>
  );
}
