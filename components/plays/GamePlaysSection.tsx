"use client";

import { usePaginatedQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PlayCard } from "@/components/plays/PlayCard";
import { buttonClasses } from "@/components/ui/Button";

/**
 * "Recent plays" for a game's detail page: the latest 5, with a "View more"
 * that pages 10 at a time. Hidden entirely (bar a log CTA) when there are none.
 */
export function GamePlaysSection({
  gameId,
  onLog,
}: {
  gameId: Id<"games">;
  onLog: () => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.plays.gamePlays,
    { gameId },
    { initialNumItems: 5 },
  );

  if (status === "LoadingFirstPage") return null;
  if (results.length === 0) {
    return (
      <section className="animate-in mb-8">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-subtle">
          Plays
        </h2>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border p-5">
          <p className="text-sm text-muted">No plays logged yet.</p>
          <button onClick={onLog} className={buttonClasses("primary", "sm")}>
            <Plus className="h-4 w-4" />
            Log a play
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="animate-in mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-subtle">
          Recent plays
        </h2>
        <button
          onClick={onLog}
          className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          Log a play
        </button>
      </div>
      <ul className="space-y-2.5">
        {results.map((p) => (
          <li key={p._id}>
            <PlayCard play={p} />
          </li>
        ))}
      </ul>
      {status === "CanLoadMore" && (
        <button
          onClick={() => loadMore(10)}
          className="mt-3 w-full rounded-xl border border-border py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          View more plays
        </button>
      )}
      {status === "LoadingMore" && (
        <p className="mt-3 text-center text-sm text-muted">Loading…</p>
      )}
    </section>
  );
}
