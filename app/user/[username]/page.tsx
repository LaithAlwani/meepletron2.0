"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Trophy,
  Dices,
  Image as ImageIcon,
  Package,
  Repeat2,
  Heart,
  Lock,
  Globe,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/Surface";
import { buttonClasses } from "@/components/ui/Button";
import { ListCard } from "@/components/top-games/ListCard";
import { CoverScroller } from "@/components/top-games/CoverScroller";
import { PlayCard } from "@/components/plays/PlayCard";
import { FriendButton } from "@/components/friends/FriendButton";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

type Tab = "posts" | "plays" | "lists" | "collection";

export default function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const data = useQuery(api.topGames.publicProfile, { username });
  const me = useQuery(api.users.me);
  const photos = useQuery(api.posts.userImagePosts, { username });
  const plays = useQuery(api.plays.userPublicPlays, { username });
  const [tab, setTab] = useState<Tab>("posts");

  if (data === undefined) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center gap-6">
          <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <p className="font-medium">No such user.</p>
          <Link href="/feed" className={`mt-4 ${buttonClasses("ghost", "sm")}`}>
            Back to the feed
          </Link>
        </div>
      </div>
    );
  }

  const { author, lists } = data;
  const isPrivate = data.private;
  const isSelf = data.isSelf;
  const initial = (author?.username ?? "?").charAt(0).toUpperCase();
  const postCount = photos?.length ?? 0;
  const playCount = plays?.length ?? 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-5 sm:gap-8">
        {author?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={author.avatarUrl}
            alt=""
            className="h-20 w-20 shrink-0 rounded-full object-cover sm:h-24 sm:w-24"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-accent/12 text-2xl font-bold text-accent sm:h-24 sm:w-24">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-display truncate text-xl font-extrabold tracking-tight">
              {author?.username ?? "Player"}
            </h1>
            {isSelf ? (
              <SelfControls isPublic={me?.publicProfile?.isPublic ?? true} />
            ) : (
              author?.username && <FriendButton username={author.username} />
            )}
          </div>
          {author?.realName && (
            <p className="mt-0.5 text-sm text-muted">{author.realName}</p>
          )}
          {!isPrivate && (
            <div className="mt-3 flex gap-6 text-sm">
              <Stat n={postCount} label="posts" />
              <Stat n={playCount} label="plays" />
              <Stat n={lists.length} label="lists" />
            </div>
          )}
        </div>
      </div>

      {isPrivate ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <Lock className="mx-auto h-8 w-8 text-subtle" />
          <p className="mt-3 font-medium">This profile is private.</p>
          <p className="mt-1 text-sm">
            Add {author?.username ?? "them"} as a friend to see their posts,
            plays and lists.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 flex border-b border-border">
            <TabBtn
              active={tab === "posts"}
              onClick={() => setTab("posts")}
              icon={ImageIcon}
              label="Posts"
            />
            <TabBtn
              active={tab === "plays"}
              onClick={() => setTab("plays")}
              icon={Dices}
              label="Plays"
            />
            <TabBtn
              active={tab === "lists"}
              onClick={() => setTab("lists")}
              icon={Trophy}
              label="Lists"
            />
            <TabBtn
              active={tab === "collection"}
              onClick={() => setTab("collection")}
              icon={Package}
              label="Collection"
            />
          </div>

          <div className="mt-5">
            {tab === "posts" && <PostsGrid photos={photos} />}
            {tab === "plays" && <PlaysList plays={plays} />}
            {tab === "lists" && <ListsGrid lists={lists} />}
            {tab === "collection" && (
              <CollectionTab
                username={username}
                owned={data.owned}
                forTrade={data.forTrade}
                wishlist={data.wishlist}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <span className="text-muted">
      <b className="text-foreground">{n}</b> {label}
    </span>
  );
}

function SelfControls({ isPublic }: { isPublic: boolean }) {
  const setPublicProfile = useMutation(api.users.setPublicProfile);
  const toast = useToast();
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={async () => {
          try {
            await setPublicProfile({ isPublic: !isPublic });
            toast(
              isPublic ? "Profile is now private." : "Profile is now public.",
              "success",
            );
          } catch {
            toast("Couldn't update.", "error");
          }
        }}
        className={buttonClasses("subtle", "sm")}
        title={isPublic ? "Make private" : "Make public"}
      >
        {isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        {isPublic ? "Public" : "Private"}
      </button>
      <Link href="/profile" className={buttonClasses("ghost", "sm")}>
        <Pencil className="h-4 w-4" />
        <span className="hidden sm:inline">Edit</span>
      </Link>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Trophy;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-sm font-semibold transition-colors",
        active
          ? "border-accent text-foreground"
          : "border-transparent text-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

type Photos = FunctionReturnType<typeof api.posts.userImagePosts>;
type Plays = FunctionReturnType<typeof api.plays.userPublicPlays>;
type Lists = NonNullable<
  FunctionReturnType<typeof api.topGames.publicProfile>
>["lists"];
type Section = NonNullable<
  FunctionReturnType<typeof api.topGames.publicProfile>
>["owned"];

function EmptyTab({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
      {text}
    </p>
  );
}

function PostsGrid({ photos }: { photos: Photos | undefined }) {
  if (photos === undefined)
    return <Skeleton className="h-64 w-full rounded-xl" />;
  if (photos.length === 0) return <EmptyTab text="No photos yet." />;
  return (
    <ul className="grid grid-cols-3 gap-1.5 sm:gap-2">
      {photos.map((p) => (
        <li key={p._id}>
          <Link
            href={`/posts/${p._id}`}
            className="group relative block aspect-square overflow-hidden rounded-lg bg-surface-2 ring-1 ring-border"
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
  );
}

function PlaysList({ plays }: { plays: Plays | undefined }) {
  if (plays === undefined)
    return <Skeleton className="h-40 w-full rounded-xl" />;
  if (plays.length === 0) return <EmptyTab text="No public plays yet." />;
  return (
    <ul className="space-y-2">
      {plays.map((p) => (
        <li key={p._id}>
          <PlayCard play={p} />
        </li>
      ))}
    </ul>
  );
}

function ListsGrid({ lists }: { lists: Lists }) {
  if (lists.length === 0) return <EmptyTab text="No public Top Games lists yet." />;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {lists.map((l) => (
        <li key={l._id}>
          <ListCard list={l} />
        </li>
      ))}
    </ul>
  );
}

function CollectionBlock({
  icon: Icon,
  title,
  section,
  href,
}: {
  icon: LucideIcon;
  title: string;
  section: Section;
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
    <section>
      <div className="mb-2 flex items-center gap-2 text-accent">
        <Icon className="h-4 w-4" />
        <h2 className="text-sm font-bold uppercase tracking-[0.14em]">{title}</h2>
        <span className="text-xs font-semibold text-subtle">{section.total}</span>
        {remaining > 0 && (
          <Link
            href={href}
            className="ml-auto text-xs font-semibold text-accent hover:underline"
          >
            See all
          </Link>
        )}
      </div>
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
    </section>
  );
}

function CollectionTab({
  username,
  owned,
  forTrade,
  wishlist,
}: {
  username: string;
  owned: Section;
  forTrade: Section;
  wishlist: Section;
}) {
  const empty =
    (owned?.total ?? 0) === 0 &&
    (forTrade?.total ?? 0) === 0 &&
    (wishlist?.total ?? 0) === 0;
  if (empty) {
    return (
      <EmptyTab text="No collection shared. Turn on Owned / For trade / Wishlist in Settings to show them here." />
    );
  }
  return (
    <div className="space-y-6">
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
  );
}
