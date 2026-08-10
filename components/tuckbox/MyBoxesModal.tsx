"use client";

import { useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { X, Plus, Trash2, Box } from "lucide-react";

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(ms).toLocaleDateString();
}

export function MyBoxesModal({
  open,
  onClose,
  onOpenBox,
  onNewBox,
  currentId,
}: {
  open: boolean;
  onClose: () => void;
  onOpenBox: (id: Id<"tuckboxes">) => void;
  onNewBox: () => void;
  currentId: Id<"tuckboxes"> | null;
}) {
  const boxes = useQuery(api.tuckboxes.listMine, open ? {} : "skip");
  const remove = useMutation(api.tuckboxes.remove);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="My tuckboxes"
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
      />
      <div className="animate-in relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2 className="font-display text-lg font-bold">My boxes</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onNewBox();
                onClose();
              }}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              <Plus className="h-4 w-4" />
              New box
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="themed-scroll overflow-y-auto p-5">
          {boxes === undefined ? (
            <p className="py-10 text-center text-sm text-muted">Loading…</p>
          ) : boxes.length === 0 ? (
            <div className="py-12 text-center">
              <Box className="mx-auto h-10 w-10 text-subtle" />
              <p className="mt-3 text-sm text-muted">
                No saved boxes yet. Your designs autosave here as you work.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {boxes.map((b) => {
                const active = b._id === currentId;
                return (
                  <li
                    key={b._id}
                    className={`group relative overflow-hidden rounded-xl border transition-colors ${
                      active
                        ? "border-accent ring-2 ring-accent/30"
                        : "border-border hover:border-accent/50"
                    }`}
                  >
                    <button
                      onClick={() => {
                        onOpenBox(b._id);
                        onClose();
                      }}
                      className="block w-full text-left"
                    >
                      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-surface-2">
                        {b.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={b.coverUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Box className="h-8 w-8 text-subtle" />
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {b.name || "Untitled box"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-subtle">
                          {relativeTime(b.updatedAt)}
                          {active && " · current"}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete “${b.name || "Untitled box"}”?`))
                          void remove({ id: b._id });
                      }}
                      aria-label="Delete box"
                      className="absolute right-1.5 top-1.5 rounded-md bg-background/80 p-1.5 text-subtle opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-red-600 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
