"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useConvexAuth } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Heart,
  MessageCircle,
  Trophy,
  Dices,
  Lock,
  MoreVertical,
  Pencil,
  RotateCcw,
  Globe,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Thumb } from "@/components/top-games/Thumb";
import { FORMAT_LABEL, playDate, AvatarStack } from "@/components/plays/PlayCard";
import { PhotoCarousel } from "@/components/plays/PhotoCarousel";
import { CommentsDrawer } from "@/components/plays/CommentsDrawer";
import {
  LogPlayWizard,
  buildInitialPlay,
} from "@/components/plays/LogPlayWizard";
import { ShareButton } from "@/components/boardgames/ShareButton";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { useUsernameGate } from "@/components/feed/UsernameGate";
import { relativeTime } from "@/lib/format";
import { friendlyError } from "@/lib/friendlyError";
import { cn } from "@/lib/cn";

/** A play as returned by `playCard` — the shared shape behind myPlays /
 *  userPublicPlays / gamePlays. */
export type PlayPostData =
  FunctionReturnType<typeof api.plays.userPublicPlays>[number];

/**
 * A play rendered in the home-feed "play post" style — a bordered card with an
 * owner header, an optional photo, the game / players / winners row, and (for a
 * public play) a like / comment / share bar. The owner gets a "⋯" menu to edit,
 * log again, toggle visibility, or delete. Used by the profile Plays tab and the
 * My-plays list.
 */
export function PlayPostCard({ play }: { play: PlayPostData }) {
  const { isAuthenticated } = useConvexAuth();
  const toast = useToast();
  const toggleReaction = useMutation(api.posts.toggleReaction);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const isPublic = play.visibility === "public" && !!play.postId;

  function like() {
    if (!isAuthenticated) {
      toast("Sign in to like plays.", "info", { label: "Sign in", href: "/auth" });
      return;
    }
    if (play.postId) void toggleReaction({ postId: play.postId });
  }

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/plays/${play._id}`
      : `/plays/${play._id}`;

  return (
    <article className="overflow-hidden rounded-2xl border border-border-muted bg-surface">
      {/* Owner header */}
      <div className="flex items-center gap-2.5 px-3 pt-3">
        {play.owner.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={play.owner.avatarUrl}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/12 text-xs font-bold text-accent">
            {play.owner.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          {play.owner.username ? (
            <Link
              href={`/user/${play.owner.username}`}
              className="block truncate text-sm font-semibold hover:text-accent"
            >
              {play.owner.name}
            </Link>
          ) : (
            <span className="block truncate text-sm font-semibold">
              {play.owner.name}
            </span>
          )}
          <Link
            href={`/plays/${play._id}`}
            className="mt-0.5 flex items-center gap-1 text-xs text-subtle hover:text-muted"
          >
            {relativeTime(play.createdAt)}
            {play.visibility === "private" && (
              <>
                <span aria-hidden>·</span>
                <Lock className="h-3 w-3" />
                Private
              </>
            )}
          </Link>
        </div>
        {play.isOwner && <OwnerMenu play={play} />}
      </div>

      {play.photoUrl && (
        <div className="mt-3">
          <PhotoCarousel images={[play.photoUrl]} />
        </div>
      )}

      <Link href={`/plays/${play._id}`} className="mt-2 block">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
            {play.coverUrl ? (
              <Thumb url={play.coverUrl} className="h-12 w-12" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-subtle">
                <Dices className="h-5 w-5" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display truncate font-bold">{play.title}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-subtle">
              {play.players.length > 0 && (
                <AvatarStack players={play.players} ringClass="ring-surface" />
              )}
              <span>{playDate(play.date)}</span>
              <span className="rounded-full bg-surface-2 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide">
                {FORMAT_LABEL[play.format] ?? play.format}
              </span>
            </div>
            {play.winners.length > 0 && (
              <p className="mt-0.5 inline-flex items-center gap-1 truncate text-xs font-semibold text-accent-2">
                <Trophy className="h-3 w-3 shrink-0" />
                {play.winners.slice(0, 2).join(", ")}
              </p>
            )}
          </div>
        </div>
      </Link>

      {/* Actions — public plays only (a private play has no feed post) */}
      {isPublic && (
        <div className="flex items-center gap-1 border-t border-border-muted px-2 py-1">
          <button
            onClick={like}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors",
              play.myReaction
                ? "text-red-500"
                : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <Heart className={cn("h-4 w-4", play.myReaction && "fill-current")} />
            {play.reactionCount > 0 && play.reactionCount}
          </button>
          <button
            onClick={() => setCommentsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <MessageCircle className="h-4 w-4" />
            {play.commentCount > 0 && play.commentCount}
          </button>
          <ShareButton
            title={play.title}
            text={`${play.title} — a play logged on Meepletron`}
            url={shareUrl}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          />
        </div>
      )}

      {isPublic && play.postId && (
        <CommentsDrawer
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          postId={play.postId}
        />
      )}
    </article>
  );
}

/** The owner's "⋯" menu: edit, log again, make public/private, delete. Edit and
 *  log-again lazily fetch the full play (getPlay) to seed the wizard. */
function OwnerMenu({ play }: { play: PlayPostData }) {
  const [open, setOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<"edit" | "replay" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const ensureUsername = useUsernameGate();
  const setVisibility = useMutation(api.plays.setPlayVisibility);
  const remove = useMutation(api.plays.deletePlay);

  const isPublic = play.visibility === "public";
  const playId = play._id as Id<"plays">;

  // Only fetch the heavy full play once the owner chooses edit / log-again.
  const full = useQuery(
    api.plays.getPlay,
    wizardMode ? { playId } : "skip",
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggleVisibility() {
    setOpen(false);
    // Making a play public puts it in the feed — require a username first.
    if (!isPublic && !(await ensureUsername())) return;
    try {
      await setVisibility({
        playId,
        visibility: isPublic ? "private" : "public",
      });
      toast(isPublic ? "Play is now private." : "Play is public.", "success");
    } catch (e) {
      toast(friendlyError(e, "Couldn't update."), "error");
    }
  }

  async function onDelete() {
    setOpen(false);
    const ok = await confirm({
      title: "Delete this play?",
      message:
        "This permanently removes the play and its photos. This can't be undone.",
      confirmText: "Delete play",
      danger: true,
    });
    if (!ok) return;
    try {
      await remove({ playId });
      toast("Play deleted.", "success");
    } catch (e) {
      toast(friendlyError(e, "Couldn't delete the play."), "error");
    }
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Play options"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <MoreVertical className="h-4.5 w-4.5" />
      </button>
      {open && (
        <div className="animate-in absolute right-0 top-full z-10 mt-1 w-44 rounded-xl border border-border bg-surface p-1 shadow-xl">
          <MenuItem
            icon={Pencil}
            label="Edit"
            onClick={() => {
              setOpen(false);
              setWizardMode("edit");
            }}
          />
          <MenuItem
            icon={RotateCcw}
            label="Log again"
            onClick={() => {
              setOpen(false);
              setWizardMode("replay");
            }}
          />
          <MenuItem
            icon={isPublic ? Lock : Globe}
            label={isPublic ? "Make private" : "Make public"}
            onClick={toggleVisibility}
          />
          <div className="my-1 border-t border-border" />
          <MenuItem
            icon={Trash2}
            label="Delete"
            danger
            onClick={onDelete}
          />
        </div>
      )}

      {wizardMode && full && (
        <LogPlayWizard
          open
          onClose={() => setWizardMode(null)}
          initialPlay={buildInitialPlay(full, wizardMode === "edit")}
        />
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
        danger
          ? "text-muted hover:bg-surface-2 hover:text-red-500"
          : "text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}
