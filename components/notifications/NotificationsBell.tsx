"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  usePaginatedQuery,
  useQuery,
  useMutation,
  useConvexAuth,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Bell,
  Heart,
  MessageCircle,
  AtSign,
  UserPlus,
  UserCheck,
  Dices,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";

type NotifItem = FunctionReturnType<
  typeof api.posts.myNotifications
>["page"][number];

function kindLabel(kind: NotifItem["postKind"]): string {
  return kind === "play"
    ? "play"
    : kind === "image"
      ? "photo"
      : kind === "toplist"
        ? "list"
        : "post";
}

function verb(n: NotifItem): string {
  switch (n.type) {
    case "post_like":
      return `liked your ${kindLabel(n.postKind)}`;
    case "post_comment":
      return `commented on your ${kindLabel(n.postKind)}`;
    case "comment_like":
      return "liked your comment";
    case "comment_mention":
      return "mentioned you in a comment";
    case "play_tagged":
      return "added you to a play";
    case "friend_request":
      return "sent you a friend request";
    case "friend_accept":
      return "accepted your friend request";
  }
}

/** Where a notification links: a play, a post, a profile, or the list. */
function notifHref(n: NotifItem): string {
  if (n.type === "play_tagged") {
    return n.playId ? `/plays/${n.playId}` : "/notifications";
  }
  if (n.type === "friend_request" || n.type === "friend_accept") {
    return n.actor.username ? `/user/${n.actor.username}` : "/notifications";
  }
  return n.postId ? `/posts/${n.postId}` : "/notifications";
}

function RowIcon({ type }: { type: NotifItem["type"] }) {
  const Icon =
    type === "post_like" || type === "comment_like"
      ? Heart
      : type === "comment_mention"
        ? AtSign
        : type === "play_tagged"
          ? Dices
          : type === "friend_request"
            ? UserPlus
            : type === "friend_accept"
              ? UserCheck
              : MessageCircle;
  const color =
    type === "post_like" || type === "comment_like"
      ? "text-red-500"
      : type === "comment_mention" ||
          type === "friend_request" ||
          type === "friend_accept"
        ? "text-accent-2"
        : "text-accent";
  return <Icon className={cn("h-4 w-4 shrink-0", color)} />;
}

/** The notifications list — used by the bell dropdown and the /notifications page. */
export function NotificationsList({ onNavigate }: { onNavigate?: () => void }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.posts.myNotifications,
    {},
    { initialNumItems: 15 },
  );
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || status !== "CanLoadMore") return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && loadMore(15),
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [status, loadMore]);

  if (status === "LoadingFirstPage") {
    return <p className="px-4 py-8 text-center text-sm text-subtle">Loading…</p>;
  }
  if (results.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-subtle">
        No notifications yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border-muted">
      {results.map((n) => (
        <li key={n._id}>
          <Link
            href={notifHref(n)}
            onClick={onNavigate}
            className={cn(
              "flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-2",
              !n.read && "bg-accent/5",
            )}
          >
            {n.actor.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={n.actor.avatarUrl}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/12 text-sm font-bold text-accent">
                {n.actor.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">
                <span className="font-semibold">{n.actor.name}</span> {verb(n)}
                {n.title ? (
                  <span className="text-muted"> · {n.title}</span>
                ) : null}
              </p>
              {n.snippet && (
                <p className="mt-0.5 truncate text-xs text-muted">
                  &ldquo;{n.snippet}&rdquo;
                </p>
              )}
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-subtle">
                <RowIcon type={n.type} />
                {relativeTime(n.createdAt)}
              </p>
            </div>
            {n.thumbUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={n.thumbUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-lg object-cover"
              />
            )}
          </Link>
        </li>
      ))}
      <div ref={sentinel} aria-hidden className="h-px" />
    </ul>
  );
}

/**
 * The notifications bell + unread badge with a dropdown. Two variants:
 *  - "header": inline in the desktop header (anchored dropdown).
 *  - "floating": a fixed top-right button on mobile; the panel is viewport-fixed
 *    so it always stays fully on screen.
 */
export function NotificationsBell({
  variant,
}: {
  variant: "header" | "floating";
}) {
  const { isAuthenticated } = useConvexAuth();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread =
    useQuery(
      api.posts.unreadNotificationCount,
      isAuthenticated ? {} : "skip",
    ) ?? 0;
  const markRead = useMutation(api.posts.markNotificationsRead);

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

  // Mark everything read a moment after opening (so the badge clears).
  useEffect(() => {
    if (open && unread > 0) {
      const t = setTimeout(() => void markRead({}), 700);
      return () => clearTimeout(t);
    }
  }, [open, unread, markRead]);

  // The floating bell is mobile-only and hidden where the bottom nav is hidden.
  const floatingHidden =
    variant === "floating" &&
    (pathname === "/" ||
      pathname === "/auth" ||
      pathname === "/who-goes-first" ||
      /^\/boardgames\/[^/]+\/chat/.test(pathname));

  if (!isAuthenticated || floatingHidden) return null;

  const badge = unread > 0 ? (unread > 99 ? "99+" : String(unread)) : null;

  return (
    <div
      ref={ref}
      className={
        variant === "floating"
          ? "fixed right-3 top-[calc(env(safe-area-inset-top)+0.6rem)] z-40 sm:hidden"
          : "relative hidden sm:block"
      }
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-expanded={open}
        className={cn(
          "relative flex items-center justify-center transition-colors",
          variant === "floating"
            ? "h-10 w-10 rounded-xl bg-surface/90 text-muted shadow-sm ring-1 ring-border backdrop-blur hover:text-foreground"
            : "h-9 w-9 rounded-lg text-muted hover:bg-surface-2 hover:text-foreground",
        )}
      >
        <Bell className="h-5 w-5" />
        {badge && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-accent-foreground">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div
          className={cn(
            "animate-in overflow-hidden rounded-2xl border border-border bg-surface shadow-xl",
            variant === "floating"
              ? "fixed right-2 top-[calc(env(safe-area-inset-top)+3.4rem)] max-h-[70vh] w-[calc(100vw-1rem)] max-w-sm overflow-y-auto"
              : "absolute right-0 mt-2 max-h-[70vh] w-96 overflow-y-auto",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-display text-sm font-bold">Notifications</span>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-accent hover:underline"
            >
              See all
            </Link>
          </div>
          <NotificationsList onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
