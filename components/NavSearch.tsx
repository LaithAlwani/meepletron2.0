"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X, ArrowRight, Star, Download } from "lucide-react";
import { Die } from "@/components/ui/icons";
import {
  useSearchSuggestions,
  type Suggestion,
} from "@/components/boardgames/useSearchSuggestions";
import { cn } from "@/lib/cn";

/**
 * The global game search, living in the top nav. A search icon that expands
 * into an input; typing drops a list of up to ten suggestions — the library
 * first, then games we don't have yet from BoardGameGeek. Picking one opens
 * that game (or its import); submitting instead lands on the full results page
 * (/boardgames/all?q=…), which shows everything both sources return.
 *
 * Two shapes:
 *  - inline  (desktop header): the input grows in place next to the icon.
 *  - overlay (mobile top bar): the input covers the bar; the parent must be
 *    `relative` so `inset-0` lands on it.
 */
export function NavSearch({ overlay = false }: { overlay?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  // -1 = nothing picked, so Enter falls through to "see all results".
  const [highlight, setHighlight] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const { items, searching, loading } = useSearchSuggestions(term);
  // The "see all results" row sits at the end of the same keyboard cycle.
  const optionCount = items.length + (searching ? 1 : 0);
  const seeAllIndex = items.length;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Close on a click outside (blur would fire before a suggestion's click).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    setTerm("");
    setHighlight(-1);
  }

  /** Everything both sources returned, on the page that renders both. */
  function seeAll() {
    const q = term.trim();
    close();
    router.push(q ? `/boardgames/all?q=${encodeURIComponent(q)}` : "/boardgames");
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (highlight >= 0 && highlight < items.length) go(items[highlight].href);
    else seeAll();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (optionCount === 0) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      // The extra slot is "nothing highlighted", so you can always get back out.
      setHighlight((h) => ((h + 1 + step + optionCount + 1) % (optionCount + 1)) - 1);
    }
  }

  const dropdown = open && searching && (
    <SuggestionList
      id={listId}
      items={items}
      loading={loading}
      term={term.trim()}
      highlight={highlight}
      seeAllIndex={seeAllIndex}
      onHighlight={setHighlight}
      onPick={go}
      onSeeAll={seeAll}
      className={
        overlay
          ? "absolute left-0 right-0 top-full z-20"
          : "absolute right-0 top-full z-20 mt-2 w-80"
      }
    />
  );

  const inputProps = {
    ref: inputRef,
    type: "search" as const,
    value: term,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setTerm(e.target.value);
      // A new term invalidates whatever was highlighted.
      setHighlight(-1);
    },
    onKeyDown,
    placeholder: "Search games…",
    role: "combobox" as const,
    "aria-expanded": open && searching,
    "aria-controls": listId,
    "aria-autocomplete": "list" as const,
    "aria-activedescendant":
      highlight >= 0 ? `${listId}-opt-${highlight}` : undefined,
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search games"
        title="Search games"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Search className="h-4.5 w-4.5" />
      </button>
    );
  }

  if (overlay) {
    return (
      <div ref={rootRef}>
        <form
          onSubmit={submit}
          className="absolute inset-0 z-10 flex items-center gap-1 bg-background px-1.5"
        >
          <button
            type="submit"
            aria-label="Search"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted"
          >
            <Search className="h-5 w-5" />
          </button>
          <input
            {...inputProps}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-subtle"
          />
          <button
            type="button"
            onClick={close}
            aria-label="Close search"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted"
          >
            <X className="h-5 w-5" />
          </button>
          {dropdown}
        </form>
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      <form onSubmit={submit} className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <input
          {...inputProps}
          className="w-60 rounded-xl border border-border bg-surface py-2 pl-8 pr-3 text-sm outline-none transition-shadow focus:border-accent/50 focus:ring-2 focus:ring-ring/40"
        />
        {dropdown}
      </form>
    </div>
  );
}

/** The suggestions panel: up to ten games, then "see all results". */
function SuggestionList({
  id,
  items,
  loading,
  term,
  highlight,
  seeAllIndex,
  onHighlight,
  onPick,
  onSeeAll,
  className,
}: {
  id: string;
  items: Suggestion[];
  loading: boolean;
  term: string;
  highlight: number;
  seeAllIndex: number;
  onHighlight: (i: number) => void;
  onPick: (href: string) => void;
  onSeeAll: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-surface shadow-lg",
        className,
      )}
    >
      <ul id={id} role="listbox" aria-label="Game suggestions" className="max-h-96 overflow-y-auto">
        {items.map((s, i) => (
          <li
            key={s.key}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={i === highlight}
            onMouseEnter={() => onHighlight(i)}
          >
            <Link
              href={s.href}
              onClick={(e) => {
                e.preventDefault();
                onPick(s.href);
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-2 transition-colors",
                i === highlight ? "bg-surface-2" : "hover:bg-surface-2",
              )}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-subtle">
                {s.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.thumbUrl}
                    alt=""
                    className="h-full w-full object-cover object-top"
                    loading="lazy"
                  />
                ) : (
                  <Die className="h-5 w-5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-display flex items-center gap-1.5 truncate font-bold leading-snug">
                  <span className="truncate">{s.title}</span>
                  {s.source === "bgg" && (
                    <Download
                      className="h-3.5 w-3.5 shrink-0 text-subtle"
                      aria-label="Not in the library yet — opens the importer"
                    />
                  )}
                </span>
                {s.detail && (
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {s.detail}
                  </span>
                )}
              </span>
              {s.rating != null && (
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-accent">
                  <Star className="h-3 w-3 fill-current" />
                  {s.rating.toFixed(1)}
                </span>
              )}
            </Link>
          </li>
        ))}

        {items.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted">
            {loading ? "Searching…" : `No games match “${term}”`}
          </li>
        )}

        <li
          id={`${id}-opt-${seeAllIndex}`}
          role="option"
          aria-selected={highlight === seeAllIndex}
          onMouseEnter={() => onHighlight(seeAllIndex)}
        >
          <button
            type="button"
            onClick={onSeeAll}
            className={cn(
              "flex w-full items-center justify-between gap-2 border-t border-border px-3 py-2.5 text-sm font-semibold text-accent transition-colors",
              highlight === seeAllIndex ? "bg-surface-2" : "hover:bg-surface-2",
            )}
          >
            <span className="truncate">See all results for “{term}”</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </button>
        </li>
      </ul>
    </div>
  );
}
