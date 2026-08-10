"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { stripIconBrackets } from "@/components/chat/MessageBubble";

const heading =
  "mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-subtle";

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
      <h2 className={heading}>In the box ({data.count})</h2>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {shown.map((c, i) => (
          <li
            key={i}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
          >
            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-surface-2 px-1 text-xs font-bold text-muted">
              {c.count}
            </span>
            <span className="min-w-0 flex-1 truncate">{c.item}</span>
          </li>
        ))}
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
      <h2 className={`${heading} mb-1 flex items-center gap-1.5`}>
        <BellRing className="h-3.5 w-3.5 text-accent" />
        Rules refresher
      </h2>
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
            <p className="mt-0.5 text-sm leading-relaxed text-muted">
              {r.detail}
            </p>
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

/** "Terms & icons" — rulebook-derived glossary. Collapsible past 8. */
export function GlossaryList({ gameId }: { gameId: Id<"games"> }) {
  const terms = useQuery(api.glossary.glossaryForGame, { gameId });
  const [showAll, setShowAll] = useState(false);
  if (!terms || terms.length === 0) return null;

  const LIMIT = 8;
  const shown = showAll ? terms : terms.slice(0, LIMIT);

  return (
    <section className="animate-in mb-8">
      <h2 className={heading}>Terms &amp; icons</h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shown.map((t, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-3">
            <dt className="text-sm font-semibold text-foreground">
              {stripIconBrackets(t.term)}
            </dt>
            <dd className="mt-0.5 text-sm text-muted">
              {stripIconBrackets(t.definition)}
            </dd>
          </div>
        ))}
      </dl>
      {terms.length > LIMIT && (
        <ShowMore
          count={terms.length}
          showAll={showAll}
          onToggle={() => setShowAll((v) => !v)}
        />
      )}
    </section>
  );
}
