"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

/** Short name for the button (drops the " — provider ($…)" tail from the label). */
function shortLabel(label: string): string {
  return label.split(" — ")[0];
}

/**
 * The in-chat answer-model switch: a compact button by the input that opens a
 * dropdown of the models this viewer may pick. The selection drives both the
 * answer and the aux steps; it's persisted per-user by the parent. Admin-only
 * models are already filtered out of `models` upstream, and the server re-checks
 * the choice, so this control is purely for picking — never the gate.
 */
export function ModelPicker({
  models,
  value,
  onChange,
  disabled,
  isEnabled = () => true,
}: {
  models: readonly { id: string; label: string; provider: string }[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Which models the viewer may pick; the rest show "Sign in to use". */
  isEnabled?: (id: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const current = models.find((m) => m.id === value);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Answer model"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
      >
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        <span className="max-w-40 truncate">
          {current ? shortLabel(current.label) : value}
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full left-0 z-20 mb-2 w-72 max-w-[80vw] overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          <ul className="max-h-72 overflow-y-auto py-1" data-lenis-prevent>
            {models.map((m) => {
              const active = m.id === value;
              // Locked for this viewer (e.g. a guest) → show it, but as a
              // sign-in prompt instead of a selectable option.
              if (!isEnabled(m.id)) {
                return (
                  <li key={m.id} role="option" aria-selected={false} aria-disabled>
                    <Link
                      href="/auth"
                      onClick={() => setOpen(false)}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left opacity-70 transition-colors hover:bg-surface-2 hover:opacity-100"
                    >
                      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {shortLabel(m.label)}
                        </span>
                        <span className="block truncate text-[11px] font-semibold text-accent">
                          Sign in to use
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              }
              return (
                <li key={m.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
                      active ? "bg-surface-2" : "hover:bg-surface-2",
                    )}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        active ? "text-accent" : "text-transparent",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {shortLabel(m.label)}
                      </span>
                      <span className="block truncate text-[11px] text-muted">
                        {m.label.split(" — ")[1] ?? m.provider}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
