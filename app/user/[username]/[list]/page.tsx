"use client";

import { use, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery, usePaginatedQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/Surface";
import { Die } from "@/components/ui/icons";

const TITLES: Record<string, string> = {
  owned: "Owned games",
  "for-trade": "For trade",
  wishlist: "Wishlist",
};

type CollectionList = "owned" | "for-trade" | "wishlist";

export default function CollectionListPage({
  params,
}: {
  params: Promise<{ username: string; list: string }>;
}) {
  const { username, list } = use(params);
  const valid = list === "owned" || list === "for-trade" || list === "wishlist";
  const args = valid
    ? { username, list: list as CollectionList }
    : ("skip" as const);

  const meta = useQuery(api.topGames.publicCollectionMeta, args);
  const { results, status, loadMore } = usePaginatedQuery(
    api.topGames.publicCollectionPage,
    args,
    { initialNumItems: 48 },
  );

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && status === "CanLoadMore") loadMore(48);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [status, loadMore]);

  const title = TITLES[list] ?? "Collection";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href={valid ? `/user/${username}` : "/top-games"}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {meta?.author?.name ?? (valid ? `@${username}` : "Back")}
      </Link>

      <h1 className="font-display mb-5 text-2xl font-extrabold tracking-tight">
        {title}
      </h1>

      {!valid || meta === null ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          {valid ? "No such user." : "Unknown list."}
        </p>
      ) : meta && !meta.shared ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          This player hasn&apos;t shared this list.
        </p>
      ) : status === "LoadingFirstPage" || meta === undefined ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-xl" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="text-sm text-muted">Nothing here yet.</p>
      ) : (
        <>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {results.map((g) => {
              const inner = (
                <>
                  <div className="aspect-square w-full overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border">
                    {g.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={g.thumbUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-subtle">
                        <Die className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted">
                    {g.title}
                  </p>
                </>
              );
              return (
                <li key={g._id}>
                  {g.slug ? (
                    <Link
                      href={`/boardgames/${g.slug}`}
                      className="group block"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <div ref={sentinel} className="h-10" />
          {status === "LoadingMore" && (
            <p className="mt-2 text-center text-sm text-muted">Loading…</p>
          )}
        </>
      )}
    </div>
  );
}
