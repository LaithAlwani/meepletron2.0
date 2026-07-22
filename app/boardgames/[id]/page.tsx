"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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

export default function GameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const gameId = id as Id<"games">;
  const game = useQuery(api.games.getById, { gameId });
  const me = useQuery(api.users.me);
  const isAdmin = me?.role === "admin";

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
        <span className="max-w-[220px] truncate font-medium text-foreground">
          {game.title}
        </span>
      </nav>

      {/* Hero */}
      <div className="mb-10 flex flex-col gap-8 sm:flex-row">
        <div className="mx-auto w-44 shrink-0 sm:mx-0">
          <div className="aspect-3/4 w-full overflow-hidden rounded-2xl bg-surface-2 shadow-lg">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt={game.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-5xl opacity-40">
                🎲
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
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
                href={`/boardgames/${gameId}/chat`}
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
              <p className="text-sm text-muted">{game.publishers.join(", ")}</p>
            </InfoSection>
          )}
        </div>
      )}

      {/* Rulebooks (chat sources) */}
      {rulebooks.length > 0 && (
        <InfoSection title="Rulebooks">
          <ul className="space-y-1.5">
            {rulebooks.map((rb) => (
              <li
                key={rb._id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <span className="inline-flex items-center gap-2">📖 {rb.label}</span>
                <span
                  className={
                    rb.isIngested
                      ? "text-xs text-green-600 dark:text-green-400"
                      : "text-xs text-muted"
                  }
                >
                  {rb.isIngested ? "Ready" : "Not ingested"}
                </span>
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
                  <span className="inline-flex items-center gap-2">📎 {dl.label}</span>
                  <span className="text-xs font-medium text-accent">Download ↓</span>
                </a>
              </li>
            ))}
          </ul>
        </InfoSection>
      )}

      {/* Expansions */}
      {game.expansions.length > 0 && (
        <InfoSection title={`Expansions (${game.expansions.length})`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {game.expansions.map((exp) => (
              <Link key={exp._id} href={`/boardgames/${exp._id}`} className="group flex flex-col">
                <div className="aspect-3/4 overflow-hidden rounded-xl bg-surface-2 shadow-sm">
                  {exp.thumbnailUrl || exp.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={exp.thumbnailUrl ?? exp.imageUrl ?? ""}
                      alt={exp.title}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl opacity-40">
                      🎲
                    </div>
                  )}
                </div>
                <p className="mt-1.5 truncate px-0.5 text-xs font-medium leading-tight">
                  {exp.title}
                </p>
              </Link>
            ))}
          </div>
        </InfoSection>
      )}
    </div>
  );
}
