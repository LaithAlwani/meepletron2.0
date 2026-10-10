"use client";

import { Suspense, use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Users, Clock, Baby, Star, Scale } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Die } from "@/components/ui/icons";
import { buttonClasses } from "@/components/ui/Button";
import { RequestGameButton } from "@/components/boardgames/RequestGameButton";
import { formatPlayTime } from "@/lib/format";

type Preview = NonNullable<FunctionReturnType<typeof api.bgg.preview>>;

export default function RequestGamePage({
  params,
}: {
  params: Promise<{ bggId: string }>;
}) {
  const { bggId } = use(params);
  return (
    <Suspense fallback={<Shell bggId={bggId} title={null} cover={null} />}>
      <RequestRunner bggId={bggId} />
    </Suspense>
  );
}

function RequestRunner({ bggId }: { bggId: string }) {
  const params = useSearchParams();
  const title = params.get("title");
  const cover = params.get("cover");
  const preview = useAction(api.bgg.preview);
  const [info, setInfo] = useState<Preview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const res = await preview({ bggId });
        if (res) {
          setInfo(res);
          setState("ready");
        } else {
          setState("error");
        }
      } catch {
        setState("error");
      }
    })();
  }, [bggId, preview]);

  if (state === "error") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <p className="font-medium text-foreground">
          We couldn&apos;t load that game from BoardGameGeek.
        </p>
        <Link href="/boardgames" className={`mt-4 ${buttonClasses("ghost", "sm")}`}>
          Back to the library
        </Link>
      </div>
    );
  }

  return (
    <Shell
      bggId={bggId}
      title={info?.title ?? title}
      cover={info?.imageUrl ?? cover}
      info={state === "ready" ? info : null}
    />
  );
}

function MetaItem({
  icon: Icon,
  children,
}: {
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-4 w-4 text-subtle" />
      {children}
    </span>
  );
}

function Shell({
  bggId,
  title,
  cover,
  info,
}: {
  bggId: string;
  title: string | null;
  cover: string | null;
  info?: Preview | null;
}) {
  const players =
    info?.minPlayers && info?.maxPlayers
      ? info.minPlayers === info.maxPlayers
        ? `${info.minPlayers} players`
        : `${info.minPlayers}–${info.maxPlayers} players`
      : null;
  const time = info
    ? formatPlayTime(info.minPlayTime ?? undefined, info.maxPlayTime ?? undefined)
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 nav:pt-10">
      <Link
        href="/boardgames"
        className="text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        ← Back to the library
      </Link>

      <div className="mt-4 grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-8">
        {/* Cover */}
        <div className="mx-auto w-40 sm:mx-0 sm:w-full">
          <div className="relative aspect-4/3 overflow-hidden rounded-2xl bg-surface-2 shadow-lg ring-1 ring-border">
            {cover ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full scale-105 object-cover opacity-40 blur-sm"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover}
                  alt={title ?? "Game cover"}
                  className="relative h-full w-full object-contain"
                />
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-subtle">
                <Die className="h-10 w-10" />
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
            {info?.isExpansion ? "Expansion · not in the library yet" : "Not in the library yet"}
          </p>
          <h1 className="font-display mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
            {title ?? "This game"}
            {info?.year && (
              <span className="ml-2 align-middle text-lg font-bold text-subtle">
                {info.year}
              </span>
            )}
          </h1>

          {info ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
                {players && <MetaItem icon={Users}>{players}</MetaItem>}
                {time && <MetaItem icon={Clock}>{time}</MetaItem>}
                {info.minAge && <MetaItem icon={Baby}>{info.minAge}+</MetaItem>}
                {info.rating != null && (
                  <MetaItem icon={Star}>
                    <span className="font-semibold text-accent">
                      {info.rating.toFixed(1)}
                    </span>
                    {info.ratingCount != null && (
                      <span className="text-subtle">
                        {" "}
                        ({info.ratingCount.toLocaleString()})
                      </span>
                    )}
                  </MetaItem>
                )}
                {info.weight != null && info.weight > 0 && (
                  <MetaItem icon={Scale}>{info.weight.toFixed(1)}/5</MetaItem>
                )}
              </div>

              {info.description && (
                <p className="mt-4 line-clamp-6 text-sm leading-relaxed text-muted">
                  {info.description}
                </p>
              )}
            </>
          ) : (
            // Loading the full details — show placeholders where the meta goes.
            <div className="mt-3 space-y-2">
              <div className="h-4 w-56 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-full animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-surface-2" />
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-border bg-surface-2/50 p-4">
            <p className="text-sm text-muted">
              Meepletron can only answer rules questions for games whose rulebook
              we&apos;ve added. Request this one and we&apos;ll add it — you&apos;ll
              get an email the moment it&apos;s ready to chat.
            </p>
            <RequestGameButton
              bggId={bggId}
              title={title ?? "New game"}
              className={`mt-3 ${buttonClasses("primary", "md")}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
