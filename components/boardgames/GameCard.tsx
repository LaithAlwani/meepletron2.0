import Link from "next/link";
import type { GameWithMedia } from "@/convex/games";
import { formatPlayTime } from "@/lib/format";
import { FavoriteHeart } from "./FavoriteHeart";

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

  return (
    <div
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
      className="animate-in group relative overflow-hidden rounded-xl border border-border bg-surface transition-all duration-200 hover:-translate-y-1 hover:border-accent/40 hover:shadow-lg"
    >
      <Link href={`/boardgames/${game.slug}`} className="flex flex-col">
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
          {game.thumbnailUrl || game.imageUrl ? (
            <>
              {/* Blurred, faded copy fills the frame behind the natural cover. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- Convex signed URLs are external hosts */}
              <img
                src={game.thumbnailUrl ?? game.imageUrl ?? ""}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-105 object-cover opacity-50 blur-xs transition-transform group-hover:scale-110"
                loading="lazy"
              />
              {/* eslint-disable-next-line @next/next/no-img-element -- Convex signed URLs are external hosts */}
              <img
                src={game.thumbnailUrl ?? game.imageUrl ?? ""}
                alt={game.title}
                className="relative h-full w-full object-contain transition-transform group-hover:scale-105"
                loading="lazy"
              />
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl opacity-40">
              🎲
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-3">
          <h3 className="font-semibold leading-tight">{game.title}</h3>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
            {game.year && <span>{game.year}</span>}
            {players && <span>{players} players</span>}
            {formatPlayTime(game.minPlayTime, game.maxPlayTime) && (
              <span>{formatPlayTime(game.minPlayTime, game.maxPlayTime)}</span>
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
