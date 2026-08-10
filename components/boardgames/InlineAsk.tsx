"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Inline "ask the rulebook" box on the detail page. Deep-links into the family
 * chat with the question in `?q=` (and `?module=` when asked from an expansion),
 * where it's auto-sent. Hidden when the game has no ingested rulebooks.
 */
export function InlineAsk({
  gameId,
  baseSlug,
  moduleId,
}: {
  gameId: Id<"games">;
  baseSlug: string;
  moduleId?: string;
}) {
  const sources = useQuery(api.games.chatSources, { gameId });
  const router = useRouter();
  const [q, setQ] = useState("");

  const resourceCount = (sources ?? []).reduce(
    (n, g) => n + g.rulebooks.length,
    0,
  );
  if (sources !== undefined && resourceCount === 0) return null;

  function submit() {
    const text = q.trim();
    if (!text) return;
    const params = new URLSearchParams({ q: text });
    if (moduleId) params.set("module", moduleId);
    router.push(`/boardgames/${baseSlug}/chat?${params.toString()}`);
  }

  return (
    <section className="animate-in mb-8">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Ask the rulebook
        </h2>
        <p className="mb-3 mt-0.5 text-xs text-subtle">
          Get a straight answer with the exact rulebook passage to back it up.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="e.g. Can I claim two routes on my turn?"
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            onClick={submit}
            disabled={!q.trim()}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-subtle"
          >
            Ask →
          </button>
        </div>
        {resourceCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-subtle">Searches:</span>
            {(sources ?? []).flatMap((g) =>
              g.rulebooks.map((rb) => (
                <span
                  key={rb._id}
                  className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted"
                >
                  {rb.label}
                </span>
              )),
            )}
          </div>
        )}
      </div>
    </section>
  );
}
