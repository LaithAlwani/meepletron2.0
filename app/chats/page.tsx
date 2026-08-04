"use client";

import Link from "next/link";
import {
  useQuery,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { api } from "@/convex/_generated/api";

export default function ChatsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">Your chats</h1>
      <AuthLoading>
        <ChatsSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">
            Sign in to see your rulebook chats.
          </p>
          <Link
            href="/auth"
            className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            Sign in
          </Link>
        </div>
      </Unauthenticated>
      <Authenticated>
        <ChatsList />
      </Authenticated>
    </div>
  );
}

const ChevronIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-subtle">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

function ChatsSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
        >
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-md bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded bg-surface-2" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Short relative time: "just now", "5m", "3h", "2d", else a date. */
function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function ChatsList() {
  const chats = useQuery(api.chat.listMyChats);

  if (chats === undefined) return <ChatsSkeleton />;

  if (chats.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted">
        <p>No chats yet.</p>
        <Link href="/boardgames" className="mt-2 inline-block text-accent hover:underline">
          Browse games to start one
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {chats.map((c) => {
        const row = (
          <>
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface-2">
              {c.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.thumbnailUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center opacity-40">
                  🎲
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{c.gameTitle}</span>
                <span className="shrink-0 text-xs text-subtle">
                  {relativeTime(c.lastMessageAt)}
                </span>
              </div>
              {c.lastMessage && (
                <p className="mt-0.5 truncate text-sm text-muted">
                  {c.lastMessage}
                </p>
              )}
            </div>
          </>
        );

        return (
          <li key={c._id}>
            {c.gameSlug ? (
              <Link
                href={`/boardgames/${c.gameSlug}/chat`}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-surface-2"
              >
                {row}
                {ChevronIcon}
              </Link>
            ) : (
              // Game was removed — keep the row visible but non-clickable.
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 opacity-60">
                {row}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
