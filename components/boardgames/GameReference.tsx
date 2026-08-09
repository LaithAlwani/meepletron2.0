"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { stripIconBrackets } from "@/components/chat/MessageBubble";

/** "In the box" — rulebook-derived component list. Hidden when none. */
export function ComponentsList({ gameId }: { gameId: Id<"games"> }) {
  const data = useQuery(api.glossary.componentsForGame, { gameId });
  if (!data || data.items.length === 0) return null;

  return (
    <section className="animate-in mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        In the box ({data.count})
      </h2>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {data.items.map((c, i) => (
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
    </section>
  );
}

/** "Terms & icons" — rulebook-derived glossary. Hidden when none. */
export function GlossaryList({ gameId }: { gameId: Id<"games"> }) {
  const terms = useQuery(api.glossary.glossaryForGame, { gameId });
  if (!terms || terms.length === 0) return null;

  return (
    <section className="animate-in mb-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Terms &amp; icons
      </h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {terms.map((t, i) => (
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
    </section>
  );
}
