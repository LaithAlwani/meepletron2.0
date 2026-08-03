"use client";

import { useEffect } from "react";
import type { Id } from "@/convex/_generated/dataModel";

export type SourceRulebook = { _id: Id<"rulebooks">; label: string };

export type SourceGroup = {
  gameId: Id<"games">;
  gameTitle: string;
  isBase: boolean;
  rulebooks: SourceRulebook[];
};

export const LayersIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
    <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
    <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
  </svg>
);

export function ResourcesSideNav({
  open,
  onClose,
  groups,
  selectedIds,
  onToggle,
}: {
  open: boolean;
  onClose: () => void;
  groups: SourceGroup[];
  selectedIds: Id<"rulebooks">[];
  onToggle: (id: Id<"rulebooks">, next: boolean) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const selected = new Set(selectedIds);
  // Only groups that actually have ingested rulebooks to offer.
  const shown = groups.filter((g) => g.rulebooks.length > 0);

  return (
    <div className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`}>
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 flex h-dvh w-72 max-w-[85%] flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              {LayersIcon}
              Resources
            </h3>
            <p className="mt-0.5 text-xs text-subtle">
              The AI uses every checked resource when answering. Add expansions to
              chat with their rules too.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close resources"
            className="rounded-xl p-1.5 text-muted transition-colors hover:bg-surface-2"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-[18px] w-[18px]">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-2">
          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span className="text-border">{LayersIcon}</span>
              <p className="text-sm font-medium text-subtle">No resources yet</p>
              <p className="text-xs text-subtle">
                Ingested rulebooks will appear here.
              </p>
            </div>
          ) : (
            shown.map((group) => (
              <section key={group.gameId} className="mb-3">
                <div className="flex items-center gap-2 px-3 pb-1 pt-1">
                  <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted">
                    {group.gameTitle}
                  </span>
                  {!group.isBase && (
                    <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-subtle">
                      Expansion
                    </span>
                  )}
                </div>
                {group.rulebooks.map((rb) => {
                  const checked = selected.has(rb._id);
                  return (
                    <label
                      key={rb._id}
                      className={`mx-1 mb-0.5 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all hover:bg-surface-2 ${
                        checked ? "bg-accent/10" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => onToggle(rb._id, e.target.checked)}
                        className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                      />
                      <span className="flex-1 truncate">{rb.label}</span>
                    </label>
                  );
                })}
              </section>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
