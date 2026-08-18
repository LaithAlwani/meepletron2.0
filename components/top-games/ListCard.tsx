"use client";

import Link from "next/link";
import { Globe } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { Chip } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";
import { topListTitle } from "@/lib/topGamesTitle";

export type TopListRow = {
  _id: Id<"topGamesLists">;
  size: number;
  year: number;
  title: string | null;
  status: "draft" | "finalized";
  visibility: "private" | "public";
  count: number;
  updatedAt: number;
  covers: string[];
};

// Per-position jitter so the covers scatter instead of lining up in a grid.
const TOPS = [8, -8, 10, -6, 5, -9];
const ROTS = [-7, 4, -3, 6, -4, 5];

/** A neutral status chip (used on plain, coverless cards). */
export function StatusChip({ list }: { list: TopListRow }) {
  if (list.status === "draft") return <Chip>Draft</Chip>;
  if (list.visibility === "public")
    return (
      <Chip tone={2}>
        <Globe className="h-3 w-3" />
        Public
      </Chip>
    );
  return <Chip tone={1}>Finalized</Chip>;
}

/** A dark, glassy status pill that reads over the cover collage. */
function OverlayChip({ list }: { list: TopListRow }) {
  const label =
    list.status === "draft"
      ? "Draft"
      : list.visibility === "public"
        ? "Public"
        : "Finalized";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-0.5 text-[11px] font-semibold text-white ring-1 ring-white/25 backdrop-blur-sm">
      {list.status !== "draft" && list.visibility === "public" && (
        <Globe className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}

/**
 * A list card. When the list has games, its covers fill the background as an
 * uneven, overlapping collage (board-game-card style) with the title overlaid;
 * an empty list falls back to a plain surface card.
 */
export function ListCard({ list }: { list: TopListRow }) {
  const heading = topListTitle(list.size, list.year, list.title);
  const covers = list.covers;
  const hasCollage = covers.length > 0;
  const step = 84 / Math.max(covers.length, 1);

  return (
    <Link
      href={`/top-games/${list._id}`}
      className="group relative flex h-40 flex-col justify-end overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg"
    >
      {hasCollage && (
        <div className="absolute inset-0 bg-surface-2" aria-hidden>
          <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105">
            {covers.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt=""
                loading="lazy"
                className="absolute h-[82%] w-[46%] rounded-lg object-cover shadow-xl ring-1 ring-black/25"
                style={{
                  left: `${i * step - 4}%`,
                  top: `${TOPS[i % TOPS.length]}%`,
                  transform: `rotate(${ROTS[i % ROTS.length]}deg)`,
                  zIndex: i,
                }}
              />
            ))}
          </div>
          {/* Legibility scrim, stronger toward the bottom where the text sits. */}
          <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/45 to-black/15" />
        </div>
      )}

      <div className="absolute right-3 top-3 z-10">
        {hasCollage ? <OverlayChip list={list} /> : <StatusChip list={list} />}
      </div>

      <div className="relative z-10">
        <span
          className={cn(
            "font-display block truncate text-lg font-extrabold",
            hasCollage && "text-white drop-shadow-sm",
          )}
        >
          {heading}
        </span>
      </div>
    </Link>
  );
}
