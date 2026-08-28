"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { AvatarImg } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

type PlayDetail = NonNullable<FunctionReturnType<typeof api.plays.getPlay>>;
export type PlayPlayer = PlayDetail["players"][number];
type PlayTeam = NonNullable<PlayDetail["teams"]>[number];
type ScoreMode = PlayDetail["scoreMode"];

/**
 * Order two optional figures, with "not recorded" always sorting last so an
 * unscored player never outranks a scored one.
 */
function compare(
  a: number | undefined,
  b: number | undefined,
  direction: "ascending" | "descending",
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return direction === "ascending" ? a - b : b - a;
}

/**
 * Rank players best-first. Points lead (ascending for golf-style "lowest wins"),
 * then placement, then rounds won; anyone unscored falls to the bottom in the
 * order they were logged, since Array.sort is stable.
 */
export function rankPlayers<T extends PlayPlayer>(
  players: T[],
  scoreMode: ScoreMode,
): T[] {
  const lowestWins = scoreMode === "lowest";
  return [...players].sort((a, b) => {
    const byScore = compare(
      a.score,
      b.score,
      lowestWins ? "ascending" : "descending",
    );
    if (byScore !== 0) return byScore;

    const byPlacement = compare(a.placement, b.placement, "ascending");
    if (byPlacement !== 0) return byPlacement;

    const byRounds = compare(a.roundsWon, b.roundsWon, "descending");
    if (byRounds !== 0) return byRounds;

    if (!!a.isWinner !== !!b.isWinner) return a.isWinner ? -1 : 1;
    return 0;
  });
}

/** Teams best-first: winners lead, then team score, then the order logged. */
function rankTeams(
  teams: PlayTeam[],
  scoreMode: ScoreMode,
): { team: PlayTeam; index: number }[] {
  const lowestWins = scoreMode === "lowest";
  // Keep the original index — players reference their team by it.
  return teams
    .map((team, index) => ({ team, index }))
    .sort((a, b) => {
      if (!!a.team.isWinner !== !!b.team.isWinner) return a.team.isWinner ? -1 : 1;
      const byScore = compare(
        a.team.score,
        b.team.score,
        lowestWins ? "ascending" : "descending",
      );
      if (byScore !== 0) return byScore;
      return a.index - b.index;
    });
}

function Avatar({ player, size }: { player: PlayPlayer; size: "sm" | "md" }) {
  const initial = player.name.replace(/^@/, "").charAt(0).toUpperCase();
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-bold text-muted",
        size === "md" ? "h-9 w-9 text-xs" : "h-7 w-7 text-[10px]",
      )}
    >
      <AvatarImg src={player.avatarUrl} initial={initial} />
    </span>
  );
}

/**
 * Avatar + name (+ tags). Members link to their profile; everyone else is
 * flagged as off-platform so it's clear whose stats are being tracked.
 */
function PlayerIdentity({
  player,
  size = "md",
}: {
  player: PlayPlayer;
  size?: "sm" | "md";
}) {
  const avatar = <Avatar player={player} size={size} />;

  return (
    <>
      {player.username ? (
        <Link
          href={`/user/${player.username}`}
          aria-label={`${player.name}'s profile`}
          className="shrink-0 transition-transform hover:scale-105"
        >
          {avatar}
        </Link>
      ) : (
        avatar
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "flex flex-wrap items-center gap-x-1.5 gap-y-0.5",
            size === "sm" && "text-sm",
          )}
        >
          {player.username ? (
            <Link
              href={`/user/${player.username}`}
              className={cn(
                "truncate hover:text-accent",
                player.isWinner ? "font-bold text-foreground" : "font-medium",
              )}
            >
              {player.name}
            </Link>
          ) : (
            <span
              className={cn(
                "truncate",
                player.isWinner ? "font-bold text-foreground" : "font-medium",
              )}
            >
              {player.name}
            </span>
          )}
          {!player.userId && (
            <span className="rounded-full bg-surface-2 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-subtle">
              non-user
            </span>
          )}
          {player.isNew && (
            <span className="rounded-full bg-accent-2/15 px-1.5 py-px text-[10px] font-bold uppercase text-accent-2">
              new
            </span>
          )}
        </span>
      </span>
    </>
  );
}

/** The trailing score/placement/rounds figures for a player. */
function PlayerScore({ player, size = "md" }: { player: PlayPlayer; size?: "sm" | "md" }) {
  return (
    <>
      {player.score != null && (
        <span
          className={cn(
            "font-bold tabular-nums",
            size === "md" ? "text-lg" : "text-sm",
          )}
        >
          {player.score}
        </span>
      )}
      {player.placement != null && (
        <span className="text-sm font-semibold text-muted">#{player.placement}</span>
      )}
      {player.roundsWon != null && (
        <span className="text-sm font-semibold text-muted">{player.roundsWon} rd</span>
      )}
    </>
  );
}

export function PlayersPanel({
  players,
  teams,
  scoreMode,
}: {
  players: PlayPlayer[];
  teams: PlayTeam[] | undefined;
  scoreMode: ScoreMode;
}) {
  if (teams && teams.length > 0) {
    return (
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {rankTeams(teams, scoreMode).map(({ team, index }) => (
          <div
            key={index}
            className={cn(
              "rounded-xl p-3",
              team.isWinner ? "bg-accent/10 ring-1 ring-accent/30" : "bg-surface-2",
            )}
          >
            <div className="flex items-center gap-1.5 font-display font-bold">
              {team.isWinner && <Trophy className="h-4 w-4 shrink-0 text-accent" />}
              <span className="min-w-0 truncate">{team.name}</span>
              {team.score != null && (
                <span className="ml-auto shrink-0 tabular-nums">{team.score}</span>
              )}
            </div>
            <ul className="mt-2 space-y-1.5">
              {rankPlayers(
                players.filter((p) => p.teamIndex === index),
                scoreMode,
              ).map((p, j) => (
                <li key={j} className="flex items-center gap-2">
                  <PlayerIdentity player={p} size="sm" />
                  <PlayerScore player={p} size="sm" />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return (
    <ul className="mt-5 divide-y divide-border-muted">
      {rankPlayers(players, scoreMode).map((p, i) => (
        <li key={i} className="flex items-center gap-3 px-1 py-2.5">
          {p.isWinner ? (
            <Trophy className="h-5 w-5 shrink-0 text-accent-2" />
          ) : (
            <span className="h-5 w-5 shrink-0" />
          )}
          <PlayerIdentity player={p} />
          <PlayerScore player={p} />
        </li>
      ))}
    </ul>
  );
}
