"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * The global game search, living in the top nav. A search icon that expands into
 * an input; submitting routes to the library (/boardgames?q=…), which shows the
 * matches in its results row with a "View all" into the full grid. Two shapes:
 *  - inline  (desktop header): the input grows in place next to the icon.
 *  - overlay (mobile top bar): the input covers the bar; the parent must be
 *    `relative` so `inset-0` lands on it.
 */
export function NavSearch({ overlay = false }: { overlay?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    setTerm("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = term.trim();
    close();
    router.push(q ? `/boardgames?q=${encodeURIComponent(q)}` : "/boardgames");
  }

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
          ref={inputRef}
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && close()}
          placeholder="Search games…"
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
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
      <input
        ref={inputRef}
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && close()}
        onBlur={() => !term.trim() && setOpen(false)}
        placeholder="Search games…"
        className="w-60 rounded-xl border border-border bg-surface py-2 pl-8 pr-3 text-sm outline-none transition-shadow focus:border-accent/50 focus:ring-2 focus:ring-ring/40"
      />
    </form>
  );
}
