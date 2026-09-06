import Link from "next/link";
import { Star } from "lucide-react";
import type { GameCardData } from "@/convex/games";
import { formatPlayTime } from "@/lib/format";
import { CollectionButton } from "./CollectionButton";
import { Die } from "@/components/ui/icons";

export function GameListItem({ game }: { game: GameCardData }) {
  const players =
    game.minPlayers && game.maxPlayers
      ? game.minPlayers === game.maxPlayers
        ? `${game.minPlayers} players`
        : `${game.minPlayers}–${game.maxPlayers} players`
      : null;
  const parts = [
    players,
    formatPlayTime(game.minPlayTime, game.maxPlayTime),
    game.year,
  ].filter(Boolean);
  const cover = game.thumbnailUrl ?? game.imageUrl ?? null;
  const rating = game.bggRating;
  const iconBtn =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:text-accent";

  return (
    <div className="flex items-center gap-3 py-3">
      {/* Only the cover and title navigate. */}
      <Link
        href={`/boardgames/${game.slug}`}
        aria-label={game.title}
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
          href={`/boardgames/${game.slug}`}
          className="font-display block w-fit max-w-full truncate font-bold transition-colors hover:text-accent"
        >
          {game.title}
        </Link>
        {/* players · time · year · rating — one consistent line */}
        {(parts.length > 0 || rating != null) && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
            {parts.length > 0 && (
              <span className="truncate">{parts.join(" · ")}</span>
            )}
            {rating != null && (
              <span
                className="inline-flex shrink-0 items-center gap-0.5"
                title={`BoardGameGeek average ${rating.toFixed(1)} / 10`}
              >
                {parts.length > 0 && <span aria-hidden>·</span>}
                <Star className="h-3 w-3 fill-current" />
                {rating.toFixed(1)}
              </span>
            )}
          </div>
        )}
      </div>

      <CollectionButton gameId={game._id} size="sm" className={iconBtn} />
    </div>
  );
}
