import Link from "next/link";
import { Users, Clock, Star } from "lucide-react";
import { formatPlayTime } from "@/lib/format";
import { Die } from "@/components/ui/icons";
import type { BggHit } from "./useBggSearch";

/**
 * A game we don't have locally yet, rendered to look exactly like a catalogue
 * card/row. Clicking routes to the import loader, which fetches + saves it and
 * lands on the real detail page. Deliberately indistinguishable from a library
 * game (no collection controls — there's no local id until it's saved).
 */
function importHref(hit: BggHit) {
  const params = new URLSearchParams({ title: hit.name });
  if (hit.thumbUrl) params.set("cover", hit.thumbUrl);
  return `/boardgames/import/${hit.bggId}?${params.toString()}`;
}

export function PreviewCard({ hit, index = 0 }: { hit: BggHit; index?: number }) {
  const players =
    hit.minPlayers && hit.maxPlayers
      ? hit.minPlayers === hit.maxPlayers
        ? `${hit.minPlayers}`
        : `${hit.minPlayers}–${hit.maxPlayers}`
      : null;
  const time = formatPlayTime(hit.minPlayTime ?? undefined, hit.maxPlayTime ?? undefined);
  const cover = hit.thumbUrl;
  const href = importHref(hit);

  return (
    <div
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
      className="animate-in group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-accent/50 hover:shadow-lg"
    >
      <Link
        href={href}
        aria-label={hit.name}
        className="relative block aspect-4/3 overflow-hidden bg-surface-2"
      >
        {cover ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-105 object-cover opacity-50 blur-sm transition-transform group-hover:scale-110"
              loading="lazy"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt={hit.name}
              className="relative h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-subtle">
            <Die className="h-10 w-10" />
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="font-display line-clamp-2 font-bold leading-snug">
          <Link href={href} className="transition-colors hover:text-accent">
            {hit.name}
          </Link>
        </h3>
        <div className="mt-auto flex items-center justify-between gap-1.5 pt-2">
          <div className="flex min-w-0 items-center gap-x-2 overflow-hidden text-[11px] text-muted">
            {players && (
              <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap">
                <Users className="h-3.5 w-3.5" />
                {players}
              </span>
            )}
            {time && (
              <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap">
                <Clock className="h-3.5 w-3.5" />
                {time}
              </span>
            )}
          </div>
          {hit.rating != null && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-accent">
              <Star className="h-3 w-3 fill-current" />
              {hit.rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function PreviewRow({ hit }: { hit: BggHit }) {
  const players =
    hit.minPlayers && hit.maxPlayers
      ? hit.minPlayers === hit.maxPlayers
        ? `${hit.minPlayers} players`
        : `${hit.minPlayers}–${hit.maxPlayers} players`
      : null;
  const parts = [
    players,
    formatPlayTime(hit.minPlayTime ?? undefined, hit.maxPlayTime ?? undefined),
    hit.year,
  ].filter(Boolean);
  const cover = hit.thumbUrl;
  const href = importHref(hit);

  return (
    <div className="flex items-center gap-3 py-3">
      <Link
        href={href}
        aria-label={hit.name}
        className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-surface-2 shadow-sm"
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-full w-full object-cover object-top" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-subtle">
            <Die className="h-6 w-6" />
          </div>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="font-display block w-fit max-w-full truncate font-bold transition-colors hover:text-accent"
        >
          {hit.name}
        </Link>
        {(parts.length > 0 || hit.rating != null) && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
            {parts.length > 0 && (
              <span className="truncate">{parts.join(" · ")}</span>
            )}
            {hit.rating != null && (
              <span className="inline-flex shrink-0 items-center gap-0.5">
                {parts.length > 0 && <span aria-hidden>·</span>}
                <Star className="h-3 w-3 fill-current" />
                {hit.rating.toFixed(1)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
