"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPlayTime } from "@/lib/format";
import { FavoriteButton } from "@/components/boardgames/FavoriteButton";
import { BackgroundCover } from "@/components/boardgames/BackgroundCover";
import { ExpandableText } from "@/components/ui/ExpandableText";

function StatBadge({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
      <span className="text-muted">{icon}</span>
      <div className="leading-tight">
        <div className="text-sm font-semibold">{value}</div>
        <div className="text-[11px] text-muted">{label}</div>
      </div>
    </div>
  );
}

function InfoSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ChipList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span
          key={i}
          className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs"
        >
          {i}
        </span>
      ))}
    </div>
  );
}

/** Comma-joined list that shows the first `max` items, then a "+N more" toggle. */
function ExpandableInline({ items, max = 2 }: { items: string[]; max?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (items.length <= max) {
    return <p className="text-sm text-muted">{items.join(", ")}</p>;
  }
  const shown = expanded ? items : items.slice(0, max);
  return (
    <p className="text-sm text-muted">
      {shown.join(", ")}{" "}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="font-medium text-accent hover:underline"
      >
        {expanded ? "show less" : `+${items.length - max} more`}
      </button>
    </p>
  );
}

const iconClass = "h-[18px] w-[18px]";
const PeopleIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const ClockIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);
const AgeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
    <circle cx="12" cy="5" r="2.5" />
    <path d="M12 8v6m0 0-3 6m3-6 3 6M7 11h10" />
  </svg>
);
const PenIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const DownloadIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
);

export default function GameDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: handle } = use(params);
  const game = useQuery(api.games.getByHandle, { handle });
  const me = useQuery(api.users.me);
  const isAdmin = me?.role === "admin";

  // Jump straight to the top when switching games (e.g. base → expansion),
  // which reuse this same route and would otherwise keep the scroll position.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [handle]);
  const [zoomed, setZoomed] = useState(false);

  // Close the artwork lightbox on Escape.
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoomed(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoomed]);

  if (game === undefined) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="h-64 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    );
  }
  if (game === null) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-muted">
        Game not found.
      </div>
    );
  }

  const gameId = game._id;
  const cover = game.imageUrl ?? game.thumbnailUrl ?? null;
  const playTime = formatPlayTime(game.minPlayTime, game.maxPlayTime);
  const players =
    game.minPlayers && game.maxPlayers
      ? game.minPlayers === game.maxPlayers
        ? `${game.minPlayers}`
        : `${game.minPlayers}–${game.maxPlayers}`
      : null;
  const ingestedCount = game.rulebooks.filter((r) => r.isIngested).length;
  const rulebooks = game.rulebooks.filter((r) => r.kind !== "download");
  const downloads = game.rulebooks.filter((r) => r.kind === "download");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {cover && <BackgroundCover url={cover} />}

      {/* Breadcrumb */}
      <nav className="mb-8 flex items-center gap-1.5 text-sm text-muted" aria-label="Breadcrumb">
        <Link href="/boardgames" className="transition-colors hover:text-foreground">
          Board Games
        </Link>
        <span>/</span>
        {game.parent && (
          <>
            <Link
              href={`/boardgames/${game.parent.slug}`}
              className="max-w-[160px] truncate transition-colors hover:text-foreground"
            >
              {game.parent.title}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="max-w-[220px] truncate font-medium text-foreground">
          {game.title}
        </span>
      </nav>

      {/* Hero */}
      <div className="mb-10 flex flex-col gap-8 sm:flex-row">
        <div className="mx-auto w-fit shrink-0 sm:mx-0">
          {cover ? (
            <button
              type="button"
              onClick={() => setZoomed(true)}
              aria-label="View full artwork"
              className="group block cursor-zoom-in overflow-hidden rounded-2xl bg-surface-2 shadow-lg"
            >
              {/* Capped to 160px tall; width follows the natural aspect ratio,
                  so the whole cover shows whether it's square or wide. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover}
                alt={game.title}
                className="block max-h-40 w-auto transition-transform group-hover:scale-[1.03]"
              />
            </button>
          ) : (
            <div className="flex aspect-3/4 h-40 items-center justify-center rounded-2xl bg-surface-2 text-5xl opacity-40 shadow-lg">
              🎲
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {game.parent && (
            <Link
              href={`/boardgames/${game.parent.slug}`}
              className="mb-1.5 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
            >
              <span>🧩 Expansion of</span>
              <span className="font-semibold text-foreground">
                {game.parent.title}
              </span>
            </Link>
          )}
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold leading-tight">{game.title}</h1>
            {game.year && (
              <span className="shrink-0 rounded-full border border-border bg-surface px-3 py-1 text-sm font-medium text-muted">
                {game.year}
              </span>
            )}
            <FavoriteButton gameId={gameId} />
            {isAdmin && (
              <Link
                href={`/admin/boardgames/${gameId}`}
                aria-label="Edit game"
                title="Edit game"
                className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                {PenIcon}
              </Link>
            )}
          </div>

          {game.designers.length > 0 && (
            <p className="mb-5 text-sm text-muted">by {game.designers.join(", ")}</p>
          )}

          <div className="mb-6 flex flex-wrap gap-3">
            {players && <StatBadge icon={PeopleIcon} value={players} label="Players" />}
            {playTime && <StatBadge icon={ClockIcon} value={playTime} label="Play Time" />}
            {game.minAge && <StatBadge icon={AgeIcon} value={`${game.minAge}+`} label="Min Age" />}
          </div>

          <div className="flex flex-wrap gap-3">
            {ingestedCount > 0 ? (
              <Link
                href={
                  game.parent
                    ? `/boardgames/${game.parent.slug}/chat?module=${game._id}`
                    : `/boardgames/${game.slug}/chat`
                }
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                💬 Chat about rules
              </Link>
            ) : (
              <span className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-muted">
                No rulebook ingested yet
              </span>
            )}
            <Link
              href={`/tuckbox?gameId=${gameId}`}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-surface-2"
            >
              ✂️ Make a tuckbox
            </Link>
          </div>
        </div>
      </div>

      {/* About */}
      {game.description && (
        <InfoSection title="About">
          <ExpandableText text={game.description} className="text-muted" />
        </InfoSection>
      )}

      {/* Metadata grid */}
      {(game.categories.length > 0 ||
        game.gameMechanics.length > 0 ||
        game.artists.length > 0 ||
        game.publishers.length > 0) && (
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {game.categories.length > 0 && (
            <InfoSection title="Categories">
              <ChipList items={game.categories} />
            </InfoSection>
          )}
          {game.gameMechanics.length > 0 && (
            <InfoSection title="Mechanics">
              <ChipList items={game.gameMechanics} />
            </InfoSection>
          )}
          {game.artists.length > 0 && (
            <InfoSection title="Artists">
              <p className="text-sm text-muted">{game.artists.join(", ")}</p>
            </InfoSection>
          )}
          {game.publishers.length > 0 && (
            <InfoSection title="Publishers">
              <ExpandableInline items={game.publishers} />
            </InfoSection>
          )}
        </div>
      )}

      {/* Rulebook files — downloadable, with a note when searchable in chat. */}
      {rulebooks.length > 0 && (
        <InfoSection title="Rules & Guides">
          <ul className="space-y-1.5">
            {rulebooks.map((rb) => (
              <li key={rb._id}>
                <a
                  href={rb.downloadUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-colors hover:bg-surface-2"
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span>📖</span>
                    <span className="truncate">{rb.label}</span>
                  </span>
                  <span className="shrink-0 text-accent" aria-label="Download">
                    {DownloadIcon}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </InfoSection>
      )}

      {/* Downloads (add-ons) */}
      {downloads.length > 0 && (
        <InfoSection title="Downloads">
          <ul className="space-y-1.5">
            {downloads.map((dl) => (
              <li key={dl._id}>
                <a
                  href={dl.downloadUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-colors hover:bg-surface-2"
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span>📎</span>
                    <span className="truncate">{dl.label}</span>
                  </span>
                  <span className="shrink-0 text-accent" aria-label="Download">
                    {DownloadIcon}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </InfoSection>
      )}

      {/* Expansions */}
      {game.expansions.length > 0 && (
        <InfoSection title={`Expansions (${game.expansions.length})`}>
          {/* Mobile: a compact list. */}
          <ul className="space-y-2 sm:hidden">
            {game.expansions.map((exp) => (
              <li key={exp._id}>
                <Link
                  href={`/boardgames/${exp.slug}`}
                  className="group flex items-center gap-3 rounded-lg border border-border bg-surface p-2 transition-colors hover:bg-surface-2"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-2">
                    {exp.thumbnailUrl || exp.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={exp.thumbnailUrl ?? exp.imageUrl ?? ""}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center opacity-40">
                        🎲
                      </div>
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium transition-colors group-hover:text-accent">
                    {exp.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: a smaller cover grid. */}
          <div className="hidden gap-3 sm:grid sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {game.expansions.map((exp) => (
              <Link key={exp._id} href={`/boardgames/${exp.slug}`} className="group flex flex-col">
                <div className="aspect-3/4 overflow-hidden rounded-lg bg-surface-2 shadow-sm">
                  {exp.thumbnailUrl || exp.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={exp.thumbnailUrl ?? exp.imageUrl ?? ""}
                      alt={exp.title}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl opacity-40">
                      🎲
                    </div>
                  )}
                </div>
                <p className="mt-1 truncate px-0.5 text-xs font-medium leading-tight">
                  {exp.title}
                </p>
              </Link>
            ))}
          </div>
        </InfoSection>
      )}

      {/* Full-artwork lightbox */}
      {zoomed && cover && (
        <div
          onClick={() => setZoomed(false)}
          className="animate-in fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-label="Game artwork"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt={game.title}
            className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
          />
          <button
            onClick={() => setZoomed(false)}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
