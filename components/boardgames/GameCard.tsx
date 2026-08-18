import Link from "next/link";
import { Users, Clock, Star } from "lucide-react";
import type { GameWithMedia } from "@/convex/games";
import { formatPlayTime } from "@/lib/format";
import { CollectionButton } from "./CollectionButton";
import { CollectionTags } from "./CollectionTags";
import { Die } from "@/components/ui/icons";

export function GameCard({
  game,
  index = 0,
}: {
  game: GameWithMedia;
  index?: number;
}) {
  const players =
    game.minPlayers && game.maxPlayers
      ? game.minPlayers === game.maxPlayers
        ? `${game.minPlayers}`
        : `${game.minPlayers}–${game.maxPlayers}`
      : null;
  const time = formatPlayTime(game.minPlayTime, game.maxPlayTime);
  const cover = game.thumbnailUrl ?? game.imageUrl ?? "";
  const rating = game.bgg?.rating;

  const iconBtn =
    "flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:text-accent";

  return (
    <div
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
      className="animate-in group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-accent/50 hover:shadow-lg"
    >
      {/* Only the cover and title navigate — so clicks near the tags/footer
          don't accidentally open the detail page. */}
      <Link
        href={`/boardgames/${game.slug}`}
        aria-label={game.title}
        className="relative block aspect-4/3 overflow-hidden bg-surface-2"
      >
        {cover ? (
          <>
            {/* Blurred, faded copy fills the frame behind the natural cover. */}
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
              alt={game.title}
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

      {/* Read-only tags: which of your collection lists this game is in.
          Flush in the top-right corner, prominent. */}
      <div className="pointer-events-none absolute right-0 top-0 z-20 flex justify-end">
        <CollectionTags gameId={game._id} size="lg" />
      </div>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="font-display line-clamp-2 font-bold leading-snug">
          <Link
            href={`/boardgames/${game.slug}`}
            className="transition-colors hover:text-accent"
          >
            {game.title}
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
          <div className="flex shrink-0 items-center gap-0.5">
            {rating != null && (
              <span
                className="mr-0.5 inline-flex items-center gap-0.5 text-[11px] font-bold text-accent"
                title={`BoardGameGeek average ${rating.toFixed(1)} / 10`}
              >
                <Star className="h-3 w-3 fill-current" />
                {rating.toFixed(1)}
              </span>
            )}
            <CollectionButton gameId={game._id} size="sm" className={iconBtn} />
          </div>
        </div>
      </div>
    </div>
  );
}
