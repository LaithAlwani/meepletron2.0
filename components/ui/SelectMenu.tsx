"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type SelectOption<T extends string | number> = {
  value: T;
  label: string;
};

/**
 * A site-styled single-select dropdown — a replacement for the native `<select>`,
 * whose option list is OS-rendered and clashes with the rest of the UI. Matches
 * the Field styling (rounded, bordered, surface) and opens a themed popover with
 * a checkmark on the active option. Click-away / Escape close it; arrow keys move
 * the selection while open.
 */
export function SelectMenu<T extends string | number>({
  value,
  onChange,
  options,
  className,
  placeholder = "Select…",
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = options.findIndex((o) => o.value === value);
        const next =
          e.key === "ArrowDown"
            ? Math.min(options.length - 1, i + 1)
            : Math.max(0, i - 1);
        if (options[next]) onChange(options[next].value);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, options, value, onChange]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-xl border bg-surface px-3.5 text-sm font-semibold text-foreground outline-none transition-shadow",
          open
            ? "border-accent/50 ring-2 ring-ring/40"
            : "border-border hover:border-border-muted",
        )}
      >
        <span className={cn("truncate", !selected && "font-medium text-subtle")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-subtle transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="animate-in absolute left-0 right-0 z-20 mt-1.5 max-h-60 overflow-auto rounded-xl border border-border bg-surface p-1 shadow-xl"
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <li key={String(o.value)} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                    active
                      ? "bg-accent/10 text-accent"
                      : "text-foreground hover:bg-surface-2",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {active && <Check className="h-4 w-4 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
