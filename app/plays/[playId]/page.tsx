"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowLeft,
  Trophy,
  Lock,
  Globe,
  Trash2,
  RotateCcw,
  Pencil,
  Clock,
  MapPin,
  Users,
  Heart,
  MessageCircle,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Thumb } from "@/components/top-games/Thumb";
import { Skeleton } from "@/components/ui/Surface";
import { buttonClasses } from "@/components/ui/Button";
import { ShareButton } from "@/components/boardgames/ShareButton";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import {
  LogPlayWizard,
  type WizardInitialPlay,
} from "@/components/plays/LogPlayWizard";
import { CommentsDrawer } from "@/components/plays/CommentsDrawer";
import { FORMAT_LABEL, playDate } from "@/components/plays/PlayCard";
import { formatPlayTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export default function PlayPage({
  params,
}: {
  params: Promise<{ playId: string }>;
}) {
  const { playId } = use(params);
  const play = useQuery(api.plays.getPlay, { playId: playId as Id<"plays"> });
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const setVisibility = useMutation(api.plays.setPlayVisibility);
  const remove = useMutation(api.plays.deletePlay);
  const toggleReaction = useMutation(api.posts.toggleReaction);
  const { isAuthenticated } = useConvexAuth();
  const [rematch, setRematch] = useState(false);
  const [editing, setEditing] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  if (play === undefined) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="mt-4 h-48 w-full" />
      </div>
    );
  }
  if (play === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <Lock className="mx-auto h-8 w-8 text-subtle" />
          <p className="mt-3 font-medium">This play is private or doesn&apos;t exist.</p>
          <Link href="/plays" className={`mt-4 ${buttonClasses("ghost", "sm")}`}>
            Back to plays
          </Link>
        </div>
      </div>
    );
  }

  const isPublic = play.visibility === "public";
  const time = formatPlayTime(play.lengthMinutes ?? undefined);
  const cover = play.photoUrls[0] ?? play.coverUrl;

  const toggleVisibility = async () => {
    try {
      await setVisibility({
        playId: play._id,
        visibility: isPublic ? "private" : "public",
      });
      toast(isPublic ? "Play is now private." : "Play is public.", "success");
    } catch {
      toast("Couldn't update.", "error");
    }
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: "Delete this play?",
      message: "This permanently removes the play and its photos. This can't be undone.",
      confirmText: "Delete play",
      danger: true,
    });
    if (!ok) return;
    try {
      await remove({ playId: play._id });
      toast("Play deleted.", "success");
      router.push("/plays");
    } catch {
      toast("Couldn't delete the play.", "error");
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/plays"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Plays
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border">
          <Thumb url={cover} className="h-20 w-20" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
              {FORMAT_LABEL[play.format] ?? play.format}
            </span>
            {play.source === "bgg" && (
              <span className="rounded-full bg-accent-2/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-2">
                BGG
              </span>
            )}
            {!isPublic && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-subtle">
                <Lock className="h-3 w-3" />
                Private
              </span>
            )}
          </div>
          <h1 className="font-display mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
            {play.gameSlug ? (
              <Link href={`/boardgames/${play.gameSlug}`} className="hover:text-accent">
                {play.title}
              </Link>
            ) : (
              play.title
            )}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{playDate(play.date)}</span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {play.players.length}
            </span>
            {time && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {time}
              </span>
            )}
            {play.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {play.location}
              </span>
            )}
          </div>
          {play.ownerName && !play.isOwner && (
            <p className="mt-1 text-sm text-subtle">
              by{" "}
              {play.ownerUsername ? (
                <Link href={`/user/${play.ownerUsername}`} className="font-semibold text-foreground hover:text-accent">
                  {play.ownerName}
                </Link>
              ) : (
                <span className="font-semibold text-foreground">{play.ownerName}</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <ShareButton
          title={play.title}
          text={`${play.title} — a play logged on Meepletron`}
          label="Share"
          labelClassName="hidden sm:inline"
          className={buttonClasses("subtle", "sm")}
        />
        {play.isOwner && (
          <>
            <button
              onClick={() => setEditing(true)}
              title="Edit"
              className={buttonClasses("ghost", "sm")}
            >
              <Pencil className="h-4 w-4" />
              <span className="hidden sm:inline">Edit</span>
            </button>
            <button
              onClick={() => setRematch(true)}
              title="Rematch"
              className={buttonClasses("ghost", "sm")}
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Rematch</span>
            </button>
            <button
              onClick={toggleVisibility}
              title={isPublic ? "Make private" : "Make public"}
              className={buttonClasses("ghost", "sm")}
            >
              {isPublic ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
              <span className="hidden sm:inline">
                {isPublic ? "Make private" : "Make public"}
              </span>
            </button>
            <button
              onClick={onDelete}
              title="Delete"
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-muted transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600 active:scale-[0.98] dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          </>
        )}
      </div>

      {/* Likes + comments (public plays only) */}
      {isPublic && play.postId && (
        <div className="mt-4 flex items-center gap-1 border-y border-border-muted py-1">
          <button
            onClick={() => {
              if (!isAuthenticated) {
                toast("Sign in to like plays.", "info", {
                  label: "Sign in",
                  href: "/auth",
                });
                return;
              }
              if (play.postId) void toggleReaction({ postId: play.postId });
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors",
              play.myReaction
                ? "text-red-500"
                : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <Heart className={cn("h-4 w-4", play.myReaction && "fill-current")} />
            {play.reactionCount ? play.reactionCount : "Like"}
          </button>
          <button
            onClick={() => setCommentsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <MessageCircle className="h-4 w-4" />
            {play.commentCount ? play.commentCount : "Comment"}
          </button>
        </div>
      )}

      {/* Imported-from-BGG review nudge (format was inferred). */}
      {play.isOwner && play.source === "bgg" && play.needsReview && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent-2/30 bg-accent-2/10 px-4 py-3">
          <p className="text-sm text-foreground">
            Imported from BoardGameGeek — we guessed the scoring. Check the format
            and winner.
          </p>
          <button
            onClick={() => setEditing(true)}
            className={buttonClasses("secondary", "sm")}
          >
            <Pencil className="h-4 w-4" />
            Review
          </button>
        </div>
      )}

      {/* Coop outcome */}
      {play.format === "cooperative" && play.coopOutcome && (
        <div
          className={cn(
            "mt-5 rounded-2xl border px-4 py-3 text-center font-display text-lg font-bold",
            play.coopOutcome === "win"
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-red-300 bg-red-50 text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400",
          )}
        >
          {play.coopOutcome === "win" ? "🏆 The table won" : "The table lost"}
          {play.coopScore != null && (
            <span className="ml-2 tabular-nums">· {play.coopScore} pts</span>
          )}
        </div>
      )}

      {/* Teams */}
      {play.teams && play.teams.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3">
          {play.teams.map((t, i) => (
            <div
              key={i}
              className={cn(
                "rounded-xl p-3",
                t.isWinner ? "bg-accent/10 ring-1 ring-accent/30" : "bg-surface-2",
              )}
            >
              <div className="flex items-center gap-1.5 font-display font-bold">
                {t.isWinner && <Trophy className="h-4 w-4 text-accent" />}
                {t.name}
              </div>
              <ul className="mt-1.5 space-y-0.5 text-sm text-muted">
                {play.players
                  .filter((p) => p.teamIndex === i)
                  .map((p, j) => (
                    <li key={j}>{p.name}</li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Players (non-team formats) */}
      {(!play.teams || play.teams.length === 0) && (
        <ul className="mt-5 divide-y divide-border-muted">
          {play.players.map((p, i) => (
            <li key={i} className="flex items-center gap-3 px-1 py-2.5">
              {p.isWinner ? (
                <Trophy className="h-5 w-5 shrink-0 text-accent-2" />
              ) : (
                <span className="h-5 w-5 shrink-0" />
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  p.isWinner ? "font-bold text-foreground" : "font-medium",
                )}
              >
                {p.name}
                {p.isNew && (
                  <span className="ml-1.5 rounded-full bg-accent-2/15 px-1.5 py-px text-[10px] font-bold uppercase text-accent-2">
                    new
                  </span>
                )}
              </span>
              {p.score != null && (
                <span className="text-lg font-bold tabular-nums">{p.score}</span>
              )}
              {p.placement != null && (
                <span className="text-sm font-semibold text-muted">
                  #{p.placement}
                </span>
              )}
              {p.roundsWon != null && (
                <span className="text-sm font-semibold text-muted">
                  {p.roundsWon} rd
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Photos */}
      {play.photoUrls.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {play.photoUrls.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt=""
              className="aspect-square w-full rounded-2xl object-cover ring-1 ring-border"
            />
          ))}
        </div>
      )}

      {play.comments && (
        <p className="mt-5 whitespace-pre-wrap rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          {play.comments}
        </p>
      )}

      {isPublic && play.postId && (
        <CommentsDrawer
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          postId={play.postId}
        />
      )}

      {play.isOwner && (editing || rematch) && (
        <LogPlayWizard
          open
          onClose={() => {
            setEditing(false);
            setRematch(false);
          }}
          initialPlay={buildInitialPlay(play, editing)}
        />
      )}
    </div>
  );
}

type PlayDetail = NonNullable<FunctionReturnType<typeof api.plays.getPlay>>;

/** Build the wizard seed from a play — full values for edit, roster-only for rematch. */
function buildInitialPlay(play: PlayDetail, edit: boolean): WizardInitialPlay {
  const game = {
    gameId: play.gameId ?? undefined,
    bggId: play.bggId ?? undefined,
    title: play.title,
    coverUrl: play.coverUrl,
  };
  const teamNames = play.teams?.map((t) => t.name);
  const teamWinner = play.teams
    ? Math.max(0, play.teams.findIndex((t) => t.isWinner))
    : 0;
  const base = {
    game,
    format: play.format as WizardInitialPlay["format"],
    scoreMode: play.scoreMode as WizardInitialPlay["scoreMode"],
    teamNames,
    players: play.players.map((p) => ({
      name: p.name,
      userId: p.userId,
      personId: p.personId,
      teamIndex: p.teamIndex,
      isNew: p.isNew,
      score: p.score ?? null,
      placement: p.placement ?? null,
      roundsWon: p.roundsWon ?? null,
    })),
  };
  if (!edit) return base;
  return {
    ...base,
    playId: play._id,
    coopOutcome: play.coopOutcome as WizardInitialPlay["coopOutcome"],
    coopScore: play.coopScore ?? null,
    teamWinner,
    date: play.date,
    lengthMinutes: play.lengthMinutes ?? null,
    location: play.location ?? null,
    comments: play.comments ?? null,
    visibility: play.visibility,
    photoIds: play.photoIds,
    photoUrls: play.photoUrls,
  };
}
