"use client";

import Link from "next/link";
import { Trophy, Lock, Users, Clock, Dices } from "lucide-react";
import { Thumb } from "@/components/top-games/Thumb";
import { formatPlayTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export const FORMAT_LABEL: Record<string, string> = {
  competitive: "Competitive",
  cooperative: "Co-op",
  teams: "Teams",
  rounds: "Rounds",
  onevsall: "One vs all",
};

/** Turn a "YYYY-MM-DD" play date into a friendly label. */
export function playDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export type PlayCardData = {
  _id: string;
  title: string;
  gameSlug: string | null;
  coverUrl: string | null;
  photoUrl: string | null;
  photoCount: number;
  date: string;
  lengthMinutes: number | null;
  format: string;
  visibility: "private" | "public";
  playerCount: number;
  winners: string[];
};

export function PlayCard({ play }: { play: PlayCardData }) {
  const cover = play.photoUrl ?? play.coverUrl;
  const time = formatPlayTime(play.lengthMinutes ?? undefined);
  return (
    <Link
      href={`/plays/${play._id}`}
      className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-surface-2"
    >
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-2">
        {cover ? (
          <Thumb url={cover} className="h-14 w-14" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-subtle">
            <Dices className="h-6 w-6" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-display truncate font-bold">{play.title}</span>
          {play.visibility === "private" && (
            <Lock className="h-3 w-3 shrink-0 text-subtle" />
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-subtle">
          <span>{playDate(play.date)}</span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            {play.playerCount}
          </span>
          {time && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {time}
            </span>
          )}
          <span
            className={cn(
              "rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide",
              "bg-surface-2 text-muted",
            )}
          >
            {FORMAT_LABEL[play.format] ?? play.format}
          </span>
        </div>
        {play.winners.length > 0 && (
          <p className="mt-0.5 inline-flex items-center gap-1 truncate text-xs font-semibold text-accent-2">
            <Trophy className="h-3 w-3 shrink-0" />
            {play.winners.slice(0, 3).join(", ")}
            {play.winners.length > 3 ? "…" : ""}
          </p>
        )}
      </div>
    </Link>
  );
}
