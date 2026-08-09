import Link from "next/link";
import type { GameWithMedia } from "@/convex/games";
import { formatPlayTime } from "@/lib/format";
import { FavoriteHeart } from "./FavoriteHeart";
import { Die } from "@/components/ui/icons";

export function GameListItem({ game }: { game: GameWithMedia }) {
  const players =
    game.minPlayers && game.maxPlayers
      ? game.minPlayers === game.maxPlayers
        ? `${game.minPlayers} players`
        : `${game.minPlayers}–${game.maxPlayers} players`
      : null;
  const stats = [players, formatPlayTime(game.minPlayTime, game.maxPlayTime), game.year]
    .filter(Boolean)
    .join(" · ");
  const cover = game.thumbnailUrl ?? game.imageUrl ?? null;

  return (
    <div className="group flex items-center gap-3 py-3">
      <Link
        href={`/boardgames/${game.slug}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-surface-2 shadow-sm">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-full w-full object-cover object-top" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-subtle">
              <Die className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display truncate font-bold transition-colors group-hover:text-accent">
            {game.title}
          </p>
          {stats && <p className="mt-0.5 text-xs text-muted">{stats}</p>}
        </div>
      </Link>
      <FavoriteHeart gameId={game._id} className="shrink-0 hover:bg-surface-2" />
    </div>
  );
}
