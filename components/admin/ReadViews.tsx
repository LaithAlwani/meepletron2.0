"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

/* ------------------------------- Details -------------------------------- */

type GameLike = {
  title: string;
  isExpansion?: boolean;
  parent?: { title: string } | null;
  year?: string;
  minPlayers?: number;
  maxPlayers?: number;
  minAge?: string;
  minPlayTime?: number;
  maxPlayTime?: number;
  description?: string;
  designers?: string[];
  artists?: string[];
  publishers?: string[];
  categories?: string[];
  gameMechanics?: string[];
  bggId?: string;
};

function range(min?: number, max?: number, suffix = ""): string {
  if (min == null && max == null) return "—";
  if (min != null && max != null && min !== max) return `${min}–${max}${suffix}`;
  return `${min ?? max}${suffix}`;
}

export function DetailsView({ game }: { game: GameLike }) {
  const rows: [string, string][] = [
    ["Title", game.title || "—"],
    ...(game.isExpansion
      ? ([["Expansion of", game.parent?.title ?? "—"]] as [string, string][])
      : []),
    ["Year", game.year || "—"],
    ["Players", range(game.minPlayers, game.maxPlayers)],
    ["Play time", range(game.minPlayTime, game.maxPlayTime, " min")],
    ["Min age", game.minAge || "—"],
    ["Designers", (game.designers ?? []).join(", ") || "—"],
    ["Artists", (game.artists ?? []).join(", ") || "—"],
    ["Publishers", (game.publishers ?? []).join(", ") || "—"],
    ["Categories", (game.categories ?? []).join(", ") || "—"],
    ["Mechanics", (game.gameMechanics ?? []).join(", ") || "—"],
    ["BGG id", game.bggId || "—"],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-subtle">
            {k}
          </dt>
          <dd className="break-words text-sm text-foreground">{v}</dd>
        </div>
      ))}
      {game.description && (
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-subtle">
            Description
          </dt>
          <dd className="whitespace-pre-wrap text-sm text-foreground">
            {game.description}
          </dd>
        </div>
      )}
    </dl>
  );
}

/* -------------------------------- Cover --------------------------------- */

export function CoverView({ imageUrl }: { imageUrl?: string | null }) {
  if (!imageUrl) return <Empty>No cover set.</Empty>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt=""
      className="h-44 w-auto rounded-lg border border-border object-contain"
    />
  );
}

/* ------------------------------ Rulebooks ------------------------------- */

export function RulebooksView({
  rulebooks,
}: {
  rulebooks: { label: string; isIngested?: boolean }[];
}) {
  if (!rulebooks.length) return <Empty>No rulebooks yet.</Empty>;
  return (
    <ul className="space-y-1.5 text-sm">
      {rulebooks.map((r, i) => (
        <li
          key={i}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
        >
          <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
          {r.isIngested === false && (
            <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
              Not ingested
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------ In the box ------------------------------ */

export function ComponentsView({ gameId }: { gameId: Id<"games"> }) {
  const data = useQuery(api.glossary.componentsForGame, { gameId });
  if (data === undefined) return <Empty>Loading…</Empty>;
  if (!data || data.items.length === 0) return <Empty>No components yet.</Empty>;
  return (
    <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {data.items.map((c, i) =>
        c.children.length > 0 ? (
          <li
            key={i}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
          >
            <div className="flex items-center gap-2">
              <Count>{c.count}</Count>
              <span className="min-w-0 flex-1 font-medium">{c.item}</span>
            </div>
            <ul className="ml-7 mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {c.children.map((ch, j) => (
                <li key={j} className="flex items-center gap-2 text-muted">
                  <Count>{ch.count}</Count>
                  <span className="min-w-0 flex-1 truncate">{ch.item}</span>
                </li>
              ))}
            </ul>
          </li>
        ) : (
          <li
            key={i}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <Count>{c.count}</Count>
            <span className="min-w-0 flex-1 truncate">{c.item}</span>
          </li>
        ),
      )}
    </ul>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-surface-2 px-1 text-xs font-bold text-muted">
      {children}
    </span>
  );
}

/* --------------------------------- FAQ ---------------------------------- */

export function FaqView({ gameId }: { gameId: Id<"games"> }) {
  const data = useQuery(api.faqs.listForGame, { gameId });
  if (data === undefined) return <Empty>Loading…</Empty>;
  if (data.length === 0) return <Empty>No questions yet.</Empty>;
  return (
    <div className="space-y-3">
      {data.map((f) => (
        <div key={f._id}>
          <p className="text-sm font-semibold">{f.question}</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">
            {f.answer}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Reminders ------------------------------- */

export function RemindersView({ gameId }: { gameId: Id<"games"> }) {
  const data = useQuery(api.reminders.listForGame, { gameId });
  if (data === undefined) return <Empty>Loading…</Empty>;
  if (data.length === 0) return <Empty>Nothing yet.</Empty>;
  return (
    <div className="space-y-2.5">
      {data.map((r, i) => (
        <div key={i}>
          <p className="text-sm font-semibold">{r.label}</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">
            {r.detail}
          </p>
        </div>
      ))}
    </div>
  );
}
