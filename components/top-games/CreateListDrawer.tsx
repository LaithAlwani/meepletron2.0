"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { X, Plus, Minus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/Field";
import { SelectMenu } from "@/components/ui/SelectMenu";
import { buttonClasses } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { topListTitle } from "@/lib/topGamesTitle";
import {
  TOP_CATEGORIES,
  DEFAULT_CATEGORY,
  categoryLabel,
} from "@/convex/lib/topGamesCategories";

const PRESETS = [10, 25, 50, 100];
const CURRENT_YEAR = new Date().getFullYear();

const LABEL =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-subtle";
const TRACK =
  "inline-flex items-center rounded-xl border border-border bg-surface-2 p-1";
const NO_SPIN =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none";

const CATEGORY_OPTIONS = TOP_CATEGORIES.map((c) => ({
  value: c.key,
  label: c.label,
}));

/**
 * "Create a new list" form in a drawer — a right-hand side panel on desktop, a
 * bottom sheet on mobile (mirrors the library FilterDrawer). Pick a category,
 * name/size/year, press Create, and it routes to that list's edit page.
 */
export function CreateListDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const create = useMutation(api.topGames.create);

  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY);
  const [title, setTitle] = useState("");
  const [size, setSize] = useState(100);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const stepYear = (d: number) =>
    setYear((y) => Math.max(1970, Math.min(2200, (y || CURRENT_YEAR) + d)));

  // The preview title falls back to the category label when unnamed, so the list
  // reads as e.g. "Top 100 · War games · 2026" rather than a bare "Top 100 · 2026".
  const previewTitle = topListTitle(
    size,
    year,
    title.trim() ||
      (category === DEFAULT_CATEGORY ? "" : categoryLabel(category)),
  );

  async function onCreate() {
    setBusy(true);
    try {
      const { listId, existed } = await create({
        category,
        size,
        year,
        title: title.trim() || undefined,
      });
      if (existed)
        toast("Opened your existing list for that category & year.", "info");
      router.push(`/top-games/${listId}`);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't create the list.", "error");
      setBusy(false);
    }
  }

  // Portal to the body so the drawer escapes the page's stacking context and
  // paints above the bottom nav (same pattern as the library FilterDrawer).
  return createPortal(
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-70 bg-foreground/30 backdrop-blur-[1px]"
      />
      {/* Bottom sheet on mobile; right-hand side drawer on desktop. */}
      <div className="animate-in fixed inset-x-0 bottom-0 z-70 flex max-h-[90vh] flex-col rounded-t-2xl border border-border bg-background shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-96 sm:rounded-none sm:rounded-l-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-lg font-bold">New list</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="themed-scroll flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div>
            <label className={LABEL}>Category</label>
            <SelectMenu
              value={category}
              onChange={setCategory}
              aria-label="Category"
              options={CATEGORY_OPTIONS}
            />
          </div>

          <div>
            <label className={LABEL}>List name (optional)</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 2-player games"
              className="h-11 w-full"
              aria-label="List name"
            />
            <p className="mt-1.5 text-xs text-muted">
              Shows as{" "}
              <span className="font-semibold text-foreground">
                {previewTitle}
              </span>
            </p>
          </div>

          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <label className={LABEL}>List size</label>
              <SelectMenu
                value={size}
                onChange={setSize}
                aria-label="List size"
                options={PRESETS.map((p) => ({ value: p, label: `Top ${p}` }))}
              />
            </div>
            <div className="shrink-0">
              <label className={LABEL}>Year</label>
              <div className={TRACK}>
                <button
                  type="button"
                  aria-label="Previous year"
                  onClick={() => stepYear(-1)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground active:scale-95"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  min={1970}
                  max={2200}
                  value={year || ""}
                  onChange={(e) => setYear(Number(e.target.value))}
                  aria-label="Year"
                  className={cn(
                    "h-9 w-14 bg-transparent text-center text-base font-bold tabular-nums text-foreground outline-none",
                    NO_SPIN,
                  )}
                />
                <button
                  type="button"
                  aria-label="Next year"
                  onClick={() => stepYear(1)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-4 py-3">
          <button
            onClick={onCreate}
            disabled={busy}
            className={buttonClasses("primary", "md", "w-full")}
          >
            <Plus className="h-4 w-4" />
            Create list
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
