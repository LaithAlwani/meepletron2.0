"use client";

import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";

/**
 * The active `?q=` term, made visible and clearable.
 *
 * The search box lives in the nav and opens empty, so without this the URL
 * quietly filters the page with a term nothing on screen names — and since it's
 * in the URL, a reload brings it straight back. The ✕ drops `q` (replacing the
 * entry, so Back doesn't walk into the search you just dismissed).
 */
export function SearchTermChip({ term }: { term: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/boardgames";
  if (!term) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface py-1 pl-3 pr-1 text-sm">
      <span className="shrink-0 text-muted">Search</span>
      <span className="min-w-0 truncate font-semibold">“{term}”</span>
      <button
        type="button"
        onClick={() => router.replace(pathname)}
        aria-label={`Clear search for ${term}`}
        title="Clear search"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
