"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  Users,
  Clock,
  Baby,
  MessageCircle,
  Scissors,
  Puzzle,
  Pencil,
  ChevronRight,
  Download,
  FileText,
  Paperclip,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { formatPlayTime } from "@/lib/format";
import { FavoriteToggle } from "@/components/boardgames/FavoriteToggle";
import { BackgroundCover } from "@/components/boardgames/BackgroundCover";
import { SimilarGames } from "@/components/boardgames/SimilarGames";
import { InlineAsk } from "@/components/boardgames/InlineAsk";
import { FaqAccordion } from "@/components/boardgames/FaqAccordion";
import { BggStats } from "@/components/boardgames/BggStats";
import {
  ComponentsList,
  RemindersList,
} from "@/components/boardgames/GameReference";
import { ExpandableText } from "@/components/ui/ExpandableText";
import { buttonClasses } from "@/components/ui/Button";
import { Die } from "@/components/ui/icons";

function InfoSection({
  title,
  children,
  delay = 0,
}: {
  title: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <section
      className="animate-in mb-8"
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-subtle">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A label → value row in the Credits block. Multi-value fields collapse to
 * `max` items with a "+N more" toggle. */
function CreditRow({
  label,
  items,
  text,
  max = 4,
}: {
  label: string;
  items?: string[];
  text?: string;
  max?: number;
}) {
  if (!text && (!items || items.length === 0)) return null;
  return (
    <div className="flex gap-4 px-4 py-3">
      <span className="w-24 shrink-0 pt-0.5 text-[11px] font-bold uppercase tracking-wide text-subtle sm:w-28">
        {label}
      </span>
      <div className="min-w-0 flex-1">
        {text ? (
          <span className="text-sm text-foreground">{text}</span>
        ) : (
          <ExpandableInline items={items!} max={max} />
        )}
      </div>
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
        className="font-semibold text-accent hover:underline"
      >
        {expanded ? "show less" : `+${items.length - max} more`}
      </button>
    </p>
  );
}

function FactChip({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm">
      <span className="text-accent">{icon}</span>
      {children}
    </span>
  );
}

function FileRow({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm transition-colors hover:border-accent/40 hover:bg-surface-2"
    >
      <span className="inline-flex min-w-0 items-center gap-2.5">
        <span className="text-accent">{icon}</span>
        <span className="truncate font-medium">{label}</span>
      </span>
      <Download className="h-4 w-4 shrink-0 text-subtle" aria-label="Download" />
    </a>
  );
}

function ExpansionsSection({
  expansions,
}: {
  expansions: {
    _id: string;
    slug: string;
    title: string;
    thumbnailUrl: string | null;
    imageUrl: string | null;
  }[];
}) {
  const [showAll, setShowAll] = useState(false);
  const LIMIT = 6;
  const shown = showAll ? expansions : expansions.slice(0, LIMIT);
  return (
    <InfoSection title={`Expansions (${expansions.length})`} delay={0.15}>
      <ul className="space-y-2">
        {shown.map((exp) => {
          const cover = exp.thumbnailUrl ?? exp.imageUrl ?? null;
          return (
            <li key={exp._id}>
              <Link
                href={`/boardgames/${exp.slug}`}
                className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-2 pr-3 transition-colors hover:border-accent/40 hover:bg-surface-2"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-subtle">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Die className="h-5 w-5" />
                  )}
                </div>
                <span className="font-display min-w-0 flex-1 truncate font-bold transition-colors group-hover:text-accent">
                  {exp.title}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-accent" />
              </Link>
            </li>
          );
        })}
      </ul>
      {expansions.length > LIMIT && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-sm font-semibold text-accent hover:underline"
        >
          {showAll ? "Show less" : `Show all ${expansions.length}`}
        </button>
      )}
    </InfoSection>
  );
}

export default function GameDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: handle } = use(params);
  const game = useQuery(api.games.getByHandle, { handle });
  const me = useQuery(api.users.me);
  const isAdmin = me?.role === "admin";

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [handle]);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoomed(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoomed]);

  if (game === undefined) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="mx-auto h-64 w-48 shrink-0 animate-pulse rounded-2xl bg-surface-2 sm:mx-0" />
          <div className="flex-1 space-y-3">
            <div className="h-9 w-2/3 animate-pulse rounded-lg bg-surface-2" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-surface-2" />
            <div className="h-20 animate-pulse rounded-xl bg-surface-2" />
          </div>
        </div>
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
  const chatHref = game.parent
    ? `/boardgames/${game.parent.slug}/chat?module=${game._id}`
    : `/boardgames/${game.slug}/chat`;

  return (
    <>
      {cover && <BackgroundCover url={cover} />}

      {/* Hero — light + warm */}
      <section className="border-b border-border-muted">
        <div className="mx-auto max-w-5xl px-4 pb-6 pt-5">
          <nav
            className="mb-5 flex items-center gap-1.5 text-sm text-muted"
            aria-label="Breadcrumb"
          >
            <Link href="/boardgames" className="transition-colors hover:text-foreground">
              Library
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-subtle" />
            {game.parent && (
              <>
                <Link
                  href={`/boardgames/${game.parent.slug}`}
                  className="max-w-[160px] truncate transition-colors hover:text-foreground"
                >
                  {game.parent.title}
                </Link>
                <ChevronRight className="h-3.5 w-3.5 text-subtle" />
              </>
            )}
            <span className="max-w-[220px] truncate font-semibold text-foreground">
              {game.title}
            </span>
          </nav>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
            {/* Cover */}
            <div className="animate-in mx-auto w-fit sm:mx-0 sm:shrink-0">
              <div className="relative w-fit">
                {cover ? (
                  <button
                    type="button"
                    onClick={() => setZoomed(true)}
                    aria-label="View full artwork"
                    className="zoom-in group block cursor-zoom-in overflow-hidden rounded-2xl bg-surface-2 shadow-xl ring-1 ring-black/5"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cover}
                      alt={game.title}
                      className="block h-56 w-auto transition-transform duration-300 group-hover:scale-[1.03] sm:h-64"
                    />
                  </button>
                ) : (
                  <div className="flex aspect-3/4 h-56 items-center justify-center rounded-2xl bg-surface-2 text-subtle shadow-xl sm:h-64">
                    <Die className="h-14 w-14" />
                  </div>
                )}
                <FavoriteToggle
                  gameId={gameId}
                  className="absolute right-2 top-2 z-10 flex items-center justify-center rounded-full bg-background/80 p-2 text-muted shadow-md backdrop-blur transition-colors hover:bg-background hover:text-foreground"
                />
                {isAdmin && (
                  <Link
                    href={`/admin/boardgames/${gameId}`}
                    aria-label="Edit game"
                    title="Edit game"
                    className="absolute bottom-2 right-2 z-10 rounded-full bg-background/80 p-2 text-muted shadow-md backdrop-blur transition-colors hover:bg-background hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>

            {/* Info */}
            <div
              className="animate-in min-w-0 flex-1"
              style={{ animationDelay: "60ms" }}
            >
              {game.parent && (
                <Link
                  href={`/boardgames/${game.parent.slug}`}
                  className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-accent-2/10 px-2.5 py-1 text-xs font-bold text-accent-2 transition-colors hover:bg-accent-2/20"
                >
                  <Puzzle className="h-3.5 w-3.5" />
                  Expansion of {game.parent.title}
                </Link>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
                  {game.title}
                </h1>
                {game.year && (
                  <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-sm font-semibold text-muted">
                    {game.year}
                  </span>
                )}
              </div>
              {game.designers.length > 0 && (
                <p className="mt-1.5 text-sm text-muted">
                  by {game.designers.join(", ")}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {players && (
                  <FactChip icon={<Users className="h-4 w-4" />}>
                    {players} players
                  </FactChip>
                )}
                {playTime && (
                  <FactChip icon={<Clock className="h-4 w-4" />}>{playTime}</FactChip>
                )}
                {game.minAge && (
                  <FactChip icon={<Baby className="h-4 w-4" />}>
                    Age {game.minAge}+
                  </FactChip>
                )}
              </div>

              {game.description && (
                <div className="mt-4 max-w-2xl">
                  <ExpandableText text={game.description} className="text-muted" />
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-2.5">
                {ingestedCount > 0 ? (
                  <Link href={chatHref} className={buttonClasses("primary", "md")}>
                    <MessageCircle className="h-4 w-4" />
                    Chat about rules
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-muted">
                    No rulebook ingested yet
                  </span>
                )}
                <Link
                  href={`/tuckbox?gameId=${gameId}`}
                  className={buttonClasses("ghost", "md")}
                >
                  <Scissors className="h-4 w-4" />
                  Make a tuckbox
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 py-8">
        <InlineAsk
          gameId={gameId}
          baseSlug={game.parent ? game.parent.slug : game.slug}
          moduleId={game.parent ? game._id : undefined}
        />

        <BggStats bgg={game.bgg} />

        <FaqAccordion gameId={gameId} />

        <RemindersList gameId={gameId} />

        {(game.designers.length > 0 ||
          game.artists.length > 0 ||
          game.publishers.length > 0 ||
          game.categories.length > 0 ||
          game.gameMechanics.length > 0) && (
          <InfoSection title="Credits">
            <div className="divide-y divide-border-muted overflow-hidden rounded-2xl border border-border bg-surface">
              <CreditRow label="Designer" items={game.designers} />
              <CreditRow label="Artist" items={game.artists} />
              <CreditRow label="Publisher" items={game.publishers} />
              <CreditRow label="Categories" items={game.categories} />
              <CreditRow label="Mechanics" items={game.gameMechanics} />
              {game.year && <CreditRow label="Year" text={game.year} />}
            </div>
          </InfoSection>
        )}

        <ComponentsList gameId={gameId} />

        {rulebooks.length > 0 && (
          <InfoSection title="Rules & Guides" delay={0.1}>
            <ul className="space-y-2">
              {rulebooks.map((rb) => (
                <li key={rb._id}>
                  <FileRow
                    href={rb.downloadUrl ?? "#"}
                    label={rb.label}
                    icon={<FileText className="h-4 w-4" />}
                  />
                </li>
              ))}
            </ul>
          </InfoSection>
        )}

        {downloads.length > 0 && (
          <InfoSection title="Downloads">
            <ul className="space-y-2">
              {downloads.map((dl) => (
                <li key={dl._id}>
                  <FileRow
                    href={dl.downloadUrl ?? "#"}
                    label={dl.label}
                    icon={<Paperclip className="h-4 w-4" />}
                  />
                </li>
              ))}
            </ul>
          </InfoSection>
        )}

        {game.expansions.length > 0 && (
          <ExpansionsSection expansions={game.expansions} />
        )}

        <SimilarGames gameId={gameId} />
      </div>

      {/* Footer CTA — the page's single accent moment */}
      <section className="bg-accent text-accent-foreground">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-12 text-center sm:flex-row sm:justify-between sm:text-left">
          <h2 className="font-display text-2xl font-extrabold leading-tight sm:text-3xl">
            Stop flipping through the rulebook mid-game.
          </h2>
          <Link
            href={ingestedCount > 0 ? chatHref : "/boardgames"}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-surface px-5 py-3 text-sm font-bold text-foreground shadow-sm transition-transform hover:-translate-y-0.5"
          >
            <MessageCircle className="h-4 w-4" />
            Get an answer
          </Link>
        </div>
      </section>

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
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  );
}
