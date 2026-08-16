"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Trophy, Globe } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Chip, Skeleton } from "@/components/ui/Surface";
import { buttonClasses } from "@/components/ui/Button";

export default function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const data = useQuery(api.topGames.publicProfile, { username });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {data === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-56" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : data === null ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <p className="font-medium">No such user.</p>
          <Link href="/top-games" className={`mt-4 ${buttonClasses("ghost", "sm")}`}>
            Explore Top Games
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-center gap-3">
            {data.author?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.author.avatarUrl}
                alt=""
                className="h-14 w-14 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/12 text-xl font-bold text-accent">
                {(data.author?.name ?? data.author?.username ?? "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">
                {data.author?.name ?? data.author?.username ?? "Player"}
              </h1>
              {data.author?.username && (
                <p className="text-sm text-muted">@{data.author.username}</p>
              )}
            </div>
          </div>

          <div className="mb-3 flex items-center gap-2 text-accent">
            <Trophy className="h-4 w-4" />
            <h2 className="text-sm font-bold uppercase tracking-[0.14em]">
              Public Top Games
            </h2>
          </div>

          {data.lists.length === 0 ? (
            <p className="text-sm text-muted">No public lists yet.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.lists.map((l) => (
                <li key={l._id}>
                  <Link
                    href={`/top-games/${l._id}`}
                    className="block rounded-2xl border border-border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display truncate font-bold">
                        {l.title ?? `Top ${l.size} · ${l.year}`}
                      </span>
                      <Chip tone={2}>
                        <Globe className="h-3 w-3" />
                        Public
                      </Chip>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Top {l.size} · {l.year} · {l.count} game
                      {l.count === 1 ? "" : "s"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
