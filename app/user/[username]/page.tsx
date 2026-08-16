"use client";

import { use } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { Trophy, Package, Repeat2, Heart, type LucideIcon } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/Surface";
import { buttonClasses } from "@/components/ui/Button";
import { ListCard } from "@/components/top-games/ListCard";
import { CoverScroller } from "@/components/top-games/CoverScroller";

type Section = {
  total: number;
  items: {
    gameId: string | null;
    title: string;
    slug: string | null;
    thumbUrl: string | null;
  }[];
};

export default function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const data = useQuery(api.topGames.publicProfile, { username });

  if (data === undefined) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="space-y-3">
          <Skeleton className="h-14 w-56" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <p className="font-medium">No such user.</p>
          <Link href="/top-games" className={`mt-4 ${buttonClasses("ghost", "sm")}`}>
            Explore Top Games
          </Link>
        </div>
      </div>
    );
  }

  const { author, lists, owned, forTrade, wishlist } = data;
  const initial = (author?.name ?? author?.username ?? "?")
    .charAt(0)
    .toUpperCase();
  const hasAnything =
    lists.length > 0 ||
    (owned?.total ?? 0) > 0 ||
    (forTrade?.total ?? 0) > 0 ||
    (wishlist?.total ?? 0) > 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        {author?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={author.avatarUrl}
            alt=""
            className="h-14 w-14 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/12 text-xl font-bold text-accent">
            {initial}
          </div>
        )}
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            {author?.name ?? author?.username ?? "Player"}
          </h1>
          {author?.username && (
            <p className="text-sm text-muted">@{author.username}</p>
          )}
        </div>
      </div>

      {!hasAnything ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          This player hasn&apos;t shared anything yet.
        </p>
      ) : (
        <div className="space-y-8">
          {lists.length > 0 && (
            <SectionBlock icon={Trophy} title="Top Games">
              <ul className="grid gap-3 sm:grid-cols-2">
                {lists.map((l) => (
                  <li key={l._id}>
                    <ListCard list={l} />
                  </li>
                ))}
              </ul>
            </SectionBlock>
          )}

          <CollectionBlock
            icon={Package}
            title="Owned games"
            section={owned}
            href={`/user/${username}/owned`}
          />
          <CollectionBlock
            icon={Repeat2}
            title="For trade"
            section={forTrade}
            href={`/user/${username}/for-trade`}
          />
          <CollectionBlock
            icon={Heart}
            title="Wishlist"
            section={wishlist}
            href={`/user/${username}/wishlist`}
          />
        </div>
      )}
    </div>
  );
}

function SectionBlock({
  icon: Icon,
  title,
  count,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-accent">
        <Icon className="h-4 w-4" />
        <h2 className="text-sm font-bold uppercase tracking-[0.14em]">{title}</h2>
        {count != null && (
          <span className="text-xs font-semibold text-subtle">{count}</span>
        )}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {children}
    </section>
  );
}

function CollectionBlock({
  icon,
  title,
  section,
  href,
}: {
  icon: LucideIcon;
  title: string;
  section: Section | null;
  href: string;
}) {
  if (!section || section.total === 0) return null;
  const remaining = section.total - section.items.length;
  const items = section.items.map((g, i) => ({
    key: g.gameId ?? String(i),
    title: g.title,
    thumbUrl: g.thumbUrl,
    href: g.slug ? `/boardgames/${g.slug}` : undefined,
  }));

  return (
    <SectionBlock
      icon={icon}
      title={title}
      count={section.total}
      action={
        remaining > 0 ? (
          <Link
            href={href}
            className="text-xs font-semibold text-accent hover:underline"
          >
            See all
          </Link>
        ) : undefined
      }
    >
      <CoverScroller
        items={items}
        trailing={
          remaining > 0 ? (
            <li className="shrink-0">
              <Link
                href={href}
                className="flex aspect-square w-24 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center text-xs font-semibold text-muted transition-colors hover:border-accent/50 hover:text-accent"
              >
                +{remaining}
                <span className="text-[10px] font-medium">more</span>
              </Link>
            </li>
          ) : undefined
        }
      />
    </SectionBlock>
  );
}
