"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import {
  useQuery,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import { Die } from "@/components/ui/icons";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Surface";

export default function FavoritesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display mb-5 text-3xl font-extrabold tracking-tight">
        Your favourites
      </h1>
      <AuthLoading>
        <FavSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">Sign in to save favourite games.</p>
          <Link href="/auth" className={`mt-4 ${buttonClasses("primary", "sm")}`}>
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

function FavSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
        >
          <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-9 w-20 shrink-0 rounded-xl" />
        </li>
      ))}
    </ul>
  );
}

function FavoritesList() {
  const favorites = useQuery(api.favorites.list);

  if (favorites === undefined) return <FavSkeleton />;

  if (favorites.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
        <p className="font-medium">No favourites yet.</p>
        <Link
          href="/boardgames"
          className="mt-2 inline-block font-semibold text-accent hover:underline"
        >
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
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition-colors hover:border-accent/40"
        >
          <Link
            href={`/boardgames/${f.slug}`}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-subtle">
              {f.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.thumbnailUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <Die className="h-6 w-6" />
              )}
            </div>
            <span className="font-display truncate font-bold">{f.title}</span>
          </Link>
          <Link
            href={`/boardgames/${f.slug}/chat`}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold text-accent transition-colors hover:bg-surface-2"
          >
            <MessageCircle className="h-4 w-4" />
            Chat
          </Link>
        </li>
      ))}
    </ul>
  );
}
