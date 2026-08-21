"use client";

import { use } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import {
  Trophy,
  Package,
  Repeat2,
  Heart,
  Dices,
  Image as ImageIcon,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/Surface";
import { buttonClasses } from "@/components/ui/Button";
import { ListCard } from "@/components/top-games/ListCard";
import { CoverScroller } from "@/components/top-games/CoverScroller";
import { PlayCard } from "@/components/plays/PlayCard";

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
  const engagement = useQuery(api.plays.playEngagement, { username });
  const photos = useQuery(api.posts.userImagePosts, { username });

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

  const { author, lists, owned, forTrade, wishlist, showPlays } = data;
  const initial = (author?.name ?? author?.username ?? "?")
    .charAt(0)
    .toUpperCase();
  const hasAnything =
    showPlays ||
    (photos?.length ?? 0) > 0 ||
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
          {engagement &&
            (engagement.likesReceived > 0 || engagement.commentsReceived > 0) && (
              <div className="mt-1 flex gap-3 text-xs text-subtle">
                <span>
                  <b className="text-foreground">{engagement.likesReceived}</b>{" "}
                  likes
                </span>
                <span>
                  <b className="text-foreground">
                    {engagement.commentsReceived}
                  </b>{" "}
                  comments
                </span>
              </div>
            )}
        </div>
      </div>

      {!hasAnything ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          This player hasn&apos;t shared anything yet.
        </p>
      ) : (
        <div className="space-y-8">
          {showPlays && <PublicPlaysBlock username={username} />}

          {photos && photos.length > 0 && (
            <SectionBlock icon={ImageIcon} title="Photos" count={photos.length}>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((p) => (
                  <li key={p._id}>
                    <Link
                      href={`/posts/${p._id}`}
                      className="group relative block aspect-square overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border"
                    >
                      {p.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.photoUrl}
                          alt={p.caption ?? ""}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      )}
                      {p.photoCount > 1 && (
                        <span className="absolute right-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {p.photoCount}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionBlock>
          )}

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

function PublicPlaysBlock({ username }: { username: string }) {
  const plays = useQuery(api.plays.userPublicPlays, { username });
  if (!plays || plays.length === 0) return null;
  return (
    <SectionBlock icon={Dices} title="Recent plays" count={plays.length}>
      <ul className="space-y-2.5">
        {plays.map((p) => (
          <li key={p._id}>
            <PlayCard play={p} />
          </li>
        ))}
      </ul>
    </SectionBlock>
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
