"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useConvexAuth } from "convex/react";
import { Heart, MessageCircle, Trophy, Dices } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Thumb } from "@/components/top-games/Thumb";
import { FORMAT_LABEL, playDate, AvatarStack } from "@/components/plays/PlayCard";
import { CommentsDrawer } from "@/components/plays/CommentsDrawer";
import { PhotoCarousel } from "@/components/plays/PhotoCarousel";
import { useToast } from "@/components/ui/Toast";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export type FeedItem = {
  _id: string;
  title: string;
  gameSlug: string | null;
  coverUrl: string | null;
  photoUrl: string | null;
  photoUrls: string[];
  date: string;
  format: string;
  playerCount: number;
  players: { name: string; avatarUrl: string | null }[];
  winners: string[];
  reactionCount: number;
  commentCount: number;
  createdAt: number;
  owner: { name: string; username: string | null; avatarUrl: string | null };
  myReaction: boolean;
};

/** One post in the public plays feed — owner header, the play, like + comment. */
export function PlayFeedItem({ item }: { item: FeedItem }) {
  const toggle = useMutation(api.plays.toggleReaction);
  const { isAuthenticated } = useConvexAuth();
  const toast = useToast();
  const [commentsOpen, setCommentsOpen] = useState(false);

  function like() {
    if (!isAuthenticated) {
      toast("Sign in to like plays.", "info", { label: "Sign in", href: "/auth" });
      return;
    }
    void toggle({ playId: item._id as Id<"plays"> });
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-border-muted bg-surface">
      {/* Owner header */}
      <div className="flex items-center gap-2.5 px-3 pt-3">
        {item.owner.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.owner.avatarUrl}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/12 text-xs font-bold text-accent">
            {item.owner.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          {item.owner.username ? (
            <Link
              href={`/user/${item.owner.username}`}
              className="truncate text-sm font-semibold hover:text-accent"
            >
              {item.owner.name}
            </Link>
          ) : (
            <span className="truncate text-sm font-semibold">{item.owner.name}</span>
          )}
          <p className="text-xs text-subtle">{relativeTime(item.createdAt)}</p>
        </div>
      </div>

      {/* Photos — swipeable carousel when there's more than one */}
      {item.photoUrls.length > 0 && (
        <div className="mt-3">
          <PhotoCarousel images={item.photoUrls} />
        </div>
      )}

      {/* Game + result */}
      <Link href={`/plays/${item._id}`} className="mt-2 block">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
            {item.coverUrl ? (
              <Thumb url={item.coverUrl} className="h-12 w-12" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-subtle">
                <Dices className="h-5 w-5" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display truncate font-bold">{item.title}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-subtle">
              {item.players.length > 0 && (
                <AvatarStack players={item.players} ringClass="ring-surface" />
              )}
              <span>{playDate(item.date)}</span>
              <span className="rounded-full bg-surface-2 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide">
                {FORMAT_LABEL[item.format] ?? item.format}
              </span>
            </div>
            {item.winners.length > 0 && (
              <p className="mt-0.5 inline-flex items-center gap-1 truncate text-xs font-semibold text-accent-2">
                <Trophy className="h-3 w-3 shrink-0" />
                {item.winners.slice(0, 2).join(", ")}
              </p>
            )}
          </div>
        </div>
      </Link>

      {/* Actions */}
      <div className="flex items-center gap-1 border-t border-border-muted px-2 py-1">
        <button
          onClick={like}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors",
            item.myReaction
              ? "text-red-500"
              : "text-muted hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <Heart className={cn("h-4 w-4", item.myReaction && "fill-current")} />
          {item.reactionCount > 0 && item.reactionCount}
        </button>
        <button
          onClick={() => setCommentsOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <MessageCircle className="h-4 w-4" />
          {item.commentCount > 0 && item.commentCount}
        </button>
      </div>

      <CommentsDrawer
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        playId={item._id as Id<"plays">}
      />
    </article>
  );
}
