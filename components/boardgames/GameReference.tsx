"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Markdown } from "@/components/ui/Markdown";
import { SectionHeading } from "@/components/ui/Surface";

function ShowMore({
  count,
  showAll,
  onToggle,
}: {
  count: number;
  showAll: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="mt-3 text-sm font-semibold text-accent hover:underline"
    >
      {showAll ? "Show less" : `Show all ${count}`}
    </button>
  );
}

/** "In the box" — rulebook-derived component list. Collapsible past 6. */
export function ComponentsList({ gameId }: { gameId: Id<"games"> }) {
  const data = useQuery(api.glossary.componentsForGame, { gameId });
  const [showAll, setShowAll] = useState(false);
  if (!data || data.items.length === 0) return null;

  const LIMIT = 6;
  const shown = showAll ? data.items : data.items.slice(0, LIMIT);

  return (
    <section className="animate-in mb-8">
      <SectionHeading className="mb-3">In the box ({data.count})</SectionHeading>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {shown.map((c, i) =>
          c.children.length > 0 ? (
            // A total broken into sub-types — show the total, then the breakdown.
            <li
              key={i}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm sm:col-span-2"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-surface-2 px-1 text-xs font-bold text-muted">
                  {c.count}
                </span>
                <span className="min-w-0 flex-1 font-medium">{c.item}</span>
              </div>
              <ul className="ml-7 mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
                {c.children.map((ch, j) => (
                  <li key={j} className="flex items-center gap-2 text-muted">
                    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-surface-2 px-1 text-xs font-bold">
                      {ch.count}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{ch.item}</span>
                  </li>
                ))}
              </ul>
            </li>
          ) : (
            <li
              key={i}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
            >
              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-surface-2 px-1 text-xs font-bold text-muted">
                {c.count}
              </span>
              <span className="min-w-0 flex-1 truncate">{c.item}</span>
            </li>
          ),
        )}
      </ul>
      {data.items.length > LIMIT && (
        <ShowMore
          count={data.count}
          showAll={showAll}
          onToggle={() => setShowAll((v) => !v)}
        />
      )}
    </section>
  );
}

/** "Rules refresher" — easily-forgotten nitty-gritty facts from the rulebook. */
export function RemindersList({ gameId }: { gameId: Id<"games"> }) {
  const reminders = useQuery(api.reminders.listForGame, { gameId });
  const [showAll, setShowAll] = useState(false);
  if (!reminders || reminders.length === 0) return null;

  const LIMIT = 6;
  const shown = showAll ? reminders : reminders.slice(0, LIMIT);

  return (
    <section className="animate-in mb-8">
      <SectionHeading className="mb-1 flex items-center gap-1.5">
        <BellRing className="h-3.5 w-3.5 text-accent" />
        Rules refresher
      </SectionHeading>
      <p className="mb-3 text-xs text-muted">
        The easy-to-forget bits, straight from the rulebook.
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {shown.map((r, i) => (
          <li
            key={i}
            className="rounded-xl border border-border bg-surface p-3"
          >
            <p className="text-sm font-bold text-foreground">{r.label}</p>
            <Markdown className="mt-0.5 text-sm leading-relaxed text-muted">
              {r.detail}
            </Markdown>
          </li>
        ))}
      </ul>
      {reminders.length > LIMIT && (
        <ShowMore
          count={reminders.length}
          showAll={showAll}
          onToggle={() => setShowAll((v) => !v)}
        />
      )}
    </section>
  );
}

