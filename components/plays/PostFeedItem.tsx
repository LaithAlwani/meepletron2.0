"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useConvexAuth } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Heart, MessageCircle, Trophy, Dices } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Thumb } from "@/components/top-games/Thumb";
import { FORMAT_LABEL, playDate, AvatarStack } from "@/components/plays/PlayCard";
import { CommentsDrawer } from "@/components/plays/CommentsDrawer";
import { PhotoCarousel } from "@/components/plays/PhotoCarousel";
import { useToast } from "@/components/ui/Toast";
import { relativeTime } from "@/lib/format";
import { topListTitle } from "@/lib/topGamesTitle";
import { categoryLabel, DEFAULT_CATEGORY } from "@/convex/lib/topGamesCategories";
import { cn } from "@/lib/cn";

/** One item from the home feed — the union of the three post kinds. */
export type FeedItem = FunctionReturnType<typeof api.posts.feed>["page"][number];

// Per-position jitter for the toplist cover collage (mirrors ListCard).
const TOPS = [8, -8, 10, -6, 5];
const ROTS = [-7, 4, -3, 6, -4];

/** One post in the home feed. Header + actions are identical across kinds; the
 *  middle content switches on `kind`. */
export function PostFeedItem({ item }: { item: FeedItem }) {
  const toggle = useMutation(api.posts.toggleReaction);
  const { isAuthenticated } = useConvexAuth();
  const toast = useToast();
  const [commentsOpen, setCommentsOpen] = useState(false);

  function like() {
    if (!isAuthenticated) {
      toast("Sign in to like posts.", "info", { label: "Sign in", href: "/auth" });
      return;
    }
    void toggle({ postId: item._id as Id<"posts"> });
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

      {/* Content by kind */}
      {item.kind === "image" && <ImageBody item={item} />}
      {item.kind === "play" && <PlayBody item={item} />}
      {item.kind === "toplist" && <TopListBody item={item} />}

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
        postId={item._id as Id<"posts">}
      />
    </article>
  );
}

/** A caption line shared by image + toplist posts. */
function Caption({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="whitespace-pre-wrap wrap-break-word px-3 pb-1 pt-2.5 text-sm text-foreground">
      {text}
    </p>
  );
}

function ImageBody({ item }: { item: Extract<FeedItem, { kind: "image" }> }) {
  return (
    <>
      <div className="mt-3">
        <PhotoCarousel images={item.photoUrls} />
      </div>
      <Caption text={item.caption} />
    </>
  );
}

function PlayBody({ item }: { item: Extract<FeedItem, { kind: "play" }> }) {
  return (
    <>
      {item.photoUrls.length > 0 && (
        <div className="mt-3">
          <PhotoCarousel images={item.photoUrls} />
        </div>
      )}
      <Link href={`/plays/${item.playId}`} className="mt-2 block">
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
    </>
  );
}

function TopListBody({ item }: { item: Extract<FeedItem, { kind: "toplist" }> }) {
  const heading = topListTitle(item.size, item.year, item.listTitle);
  const covers = item.covers;
  const hasCollage = covers.length > 0;
  const step = 84 / Math.max(covers.length, 1);

  return (
    <>
      <Caption text={item.caption} />
      <Link href={`/top-games/${item.topListId}`} className="mt-2 block px-3 pb-2">
        <div className="group relative flex h-36 flex-col justify-end overflow-hidden rounded-xl border border-border bg-surface-2 p-3">
          {hasCollage && (
            <div className="absolute inset-0" aria-hidden>
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
              <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/45 to-black/15" />
            </div>
          )}
          <div className="relative z-10 flex items-center gap-1.5">
            <Trophy
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                hasCollage ? "text-white/80" : "text-accent",
              )}
            />
            {item.category !== DEFAULT_CATEGORY && (
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-[0.14em]",
                  hasCollage ? "text-white/80 drop-shadow-sm" : "text-accent",
                )}
              >
                {categoryLabel(item.category)}
              </span>
            )}
          </div>
          <span
            className={cn(
              "font-display relative z-10 block truncate text-lg font-extrabold",
              hasCollage && "text-white drop-shadow-sm",
            )}
          >
            {heading}
          </span>
          <span
            className={cn(
              "relative z-10 text-xs",
              hasCollage ? "text-white/70" : "text-subtle",
            )}
          >
            {item.count} {item.count === 1 ? "game" : "games"}
          </span>
        </div>
      </Link>
    </>
  );
}
