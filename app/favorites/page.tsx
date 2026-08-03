"use client";

import Link from "next/link";
import {
  useQuery,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { api } from "@/convex/_generated/api";

export default function FavoritesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">Your favourites</h1>
      <AuthLoading>
        <p className="text-muted">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">Sign in to save favourite games.</p>
          <Link
            href="/auth"
            className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            Sign in
          </Link>
        </div>
      </Unauthenticated>
      <Authenticated>
        <FavoritesList />
      </Authenticated>
    </div>
  );
}

const ChatBubbleIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

function FavoritesList() {
  const favorites = useQuery(api.favorites.list);

  if (favorites === undefined) {
    return (
      <ul className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
          >
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-md bg-surface-2" />
            <div className="h-4 flex-1 animate-pulse rounded bg-surface-2" />
            <div className="h-8 w-16 shrink-0 animate-pulse rounded-lg bg-surface-2" />
          </li>
        ))}
      </ul>
    );
  }

  if (favorites.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted">
        <p>No favourites yet.</p>
        <Link href="/boardgames" className="mt-2 inline-block text-accent hover:underline">
          Browse games
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {favorites.map((f) => (
        <li
          key={f.gameId}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
        >
          <Link
            href={`/boardgames/${f.slug}`}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface-2">
              {f.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.thumbnailUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center opacity-40">
                  🎲
                </div>
              )}
            </div>
            <span className="truncate font-medium">{f.title}</span>
          </Link>
          <Link
            href={`/boardgames/${f.slug}/chat`}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-surface-2"
          >
            {ChatBubbleIcon}
            Chat
          </Link>
        </li>
      ))}
    </ul>
  );
}
