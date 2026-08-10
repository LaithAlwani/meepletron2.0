import Link from "next/link";
import { Users, Clock } from "lucide-react";
import type { GameWithMedia } from "@/convex/games";
import { formatPlayTime } from "@/lib/format";
import { FavoriteHeart } from "./FavoriteHeart";
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

  return (
    <div
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
      className="animate-in group relative w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-accent/50 hover:shadow-lg"
    >
      <Link href={`/boardgames/${game.slug}`} className="flex flex-col">
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
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
        </div>
        <div className="flex flex-1 flex-col p-3">
          <h3 className="font-display line-clamp-2 font-bold leading-snug">
            {game.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            {players && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {players}
              </span>
            )}
            {time && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {time}
              </span>
            )}
          </div>
        </div>
      </Link>

      <FavoriteHeart
        gameId={game._id}
        className="absolute right-2 top-2 z-10 bg-background/70 shadow-sm backdrop-blur"
      />
    </div>
  );
}
