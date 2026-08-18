"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { X, Bot, ChevronDown } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type {
  LibraryFilterState,
  TimeFilter,
} from "./useLibraryFilters";

const PLAYER_OPTIONS = [1, 2, 3, 4, 5, 6];
const TIME_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: "quick", label: "≤30 min" },
  { value: "standard", label: "30–90 min" },
  { value: "epic", label: "90+ min" },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
        active
          ? "border-accent bg-accent text-accent-foreground shadow-sm"
          : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** Collapsible multi-select for long option lists (genre / mechanics). */
function FilterDropdown({
  title,
  options,
  selected,
  onToggle,
  loading,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          {title}
          {selected.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-foreground">
              {selected.length}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-subtle transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-3">
          {loading ? (
            <FacetSkeleton />
          ) : options.length === 0 ? (
            <p className="text-xs text-subtle">Nothing to show.</p>
          ) : (
            options.map((o) => (
              <Chip
                key={o}
                active={selected.includes(o)}
                onClick={() => onToggle(o)}
              >
                {o}
              </Chip>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function FilterDrawer({
  open,
  onClose,
  filters,
  setFilters,
  activeCount,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  filters: LibraryFilterState;
  setFilters: (f: LibraryFilterState) => void;
  activeCount: number;
  onClear: () => void;
}) {
  const facets = useQuery(api.games.filterFacets, open ? {} : "skip");

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

  const toggleArray = (key: "categories" | "mechanics", value: string) => {
    const cur = filters[key];
    setFilters({
      ...filters,
      [key]: cur.includes(value)
        ? cur.filter((v) => v !== value)
        : [...cur, value],
    });
  };

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[1px]"
      />
      {/* Bottom sheet on mobile; right-hand side drawer on desktop. */}
      <div className="animate-in fixed inset-x-0 bottom-0 z-50 flex max-h-[82vh] flex-col rounded-t-2xl border border-border bg-background shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[24rem] sm:rounded-none sm:rounded-l-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-lg font-bold">Filters</h2>
          <div className="flex items-center gap-1">
            {activeCount > 0 && (
              <button
                onClick={onClear}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close filters"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        <div className="themed-scroll flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div className="flex flex-wrap gap-1.5">
            <Chip
              active={filters.chatOnly}
              onClick={() => setFilters({ ...filters, chatOnly: !filters.chatOnly })}
            >
              <span className="inline-flex items-center gap-1">
                <Bot className="h-3.5 w-3.5" />
                Chat-ready
              </span>
            </Chip>
            <Chip
              active={filters.hasExpansions}
              onClick={() =>
                setFilters({ ...filters, hasExpansions: !filters.hasExpansions })
              }
            >
              Has expansions
            </Chip>
          </div>

          <Group title="Players">
            {PLAYER_OPTIONS.map((p) => (
              <Chip
                key={p}
                active={filters.players === p}
                onClick={() =>
                  setFilters({
                    ...filters,
                    players: filters.players === p ? null : p,
                  })
                }
              >
                {p === 6 ? "6+" : p}
              </Chip>
            ))}
          </Group>

          <Group title="Play time">
            {TIME_OPTIONS.map(({ value, label }) => (
              <Chip
                key={value}
                active={filters.time === value}
                onClick={() =>
                  setFilters({
                    ...filters,
                    time: filters.time === value ? null : value,
                  })
                }
              >
                {label}
              </Chip>
            ))}
          </Group>

          <FilterDropdown
            title="Genre"
            loading={facets === undefined}
            options={facets?.categories ?? []}
            selected={filters.categories}
            onToggle={(v) => toggleArray("categories", v)}
          />
          <FilterDropdown
            title="Mechanics"
            loading={facets === undefined}
            options={facets?.mechanics ?? []}
            selected={filters.mechanics}
            onToggle={(v) => toggleArray("mechanics", v)}
          />
        </div>

        <div className="border-t border-border px-4 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            Show results
          </button>
        </div>
      </div>
    </>
  );
}

function FacetSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-7 w-20 animate-pulse rounded-full bg-surface-2"
        />
      ))}
    </>
  );
}
