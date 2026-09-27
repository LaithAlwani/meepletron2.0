import Link from "next/link";
import type { GameCardData } from "@/convex/games";
import { CollectionButton } from "./CollectionButton";
import { Die } from "@/components/ui/icons";

/**
 * A "shelf" game cover: a square cover with the title underneath — the unit the
 * library, collection, profile shelves, expansions and similar rails all render.
 * Quick-add lives on the top-right on hover (desktop); on touch, add from the
 * game's detail page.
 */
export function GameCard({
  game,
  index = 0,
}: {
  game: GameCardData;
  index?: number;
}) {
  const cover = game.thumbnailUrl ?? game.imageUrl ?? "";

  return (
    <div
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
      className="animate-in group"
    >
      <Link
        href={`/boardgames/${game.slug}`}
        aria-label={game.title}
        className="relative block aspect-square overflow-hidden rounded-lg bg-surface-2 shadow-[0_4px_10px_-4px_rgba(0,0,0,0.15)] transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-lg"
      >
        {cover ? (
          <>
            {/* Blurred, faded copy fills the frame behind the natural cover. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-105 object-cover opacity-50 blur-sm transition-transform duration-300 group-hover:scale-110"
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
        <div className="absolute right-2 top-2 z-20 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <CollectionButton
            gameId={game._id}
            size="md"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/55 hover:text-white"
          />
        </div>
      </Link>
      <p className="mt-1.5 truncate text-xs font-semibold">
        <Link
          href={`/boardgames/${game.slug}`}
          className="transition-colors hover:text-accent"
        >
          {game.title}
        </Link>
      </p>
    </div>
  );
}
