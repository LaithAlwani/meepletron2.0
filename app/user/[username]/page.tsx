"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import type { FunctionReturnType } from "convex/server";
import {
  Trophy,
  Dices,
  Package,
  Tag,
  Heart,
  Lock,
  Globe,
  Settings,
  Bell,
  BarChart3,
  LogOut,
  Loader2,
  Settings2,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/Surface";
import { buttonClasses } from "@/components/ui/Button";
import { ListCard } from "@/components/top-games/ListCard";
import { CoverScroller } from "@/components/top-games/CoverScroller";
import { PlayPostCard } from "@/components/plays/PlayPostCard";
import { MyPlaysFeed } from "@/components/plays/MyPlaysFeed";
import { StatsPanel } from "@/components/plays/StatsPanel";
import { FriendButton } from "@/components/friends/FriendButton";
import { FriendsSheet } from "@/components/friends/FriendsSheet";
import { CreateListDrawer } from "@/components/top-games/CreateListDrawer";
import { Fab } from "@/components/ui/Fab";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

type Tab = "stats" | "plays" | "lists" | "collection";

export default function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const data = useQuery(api.topGames.publicProfile, { username });
  const me = useQuery(api.users.me);
  // The owner's own Plays tab uses MyPlaysFeed (all plays); only fetch the
  // public list for other viewers.
  const plays = useQuery(
    api.plays.userPublicPlays,
    data?.isSelf ? "skip" : { username },
  );
  const [tab, setTab] = useState<Tab | null>(null);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [createListOpen, setCreateListOpen] = useState(false);

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
          <Link href="/boardgames" className={`mt-4 ${buttonClasses("ghost", "sm")}`}>
            Back to the Library
          </Link>
        </div>
      </div>
    );
  }

  const { author, lists } = data;
  const isPrivate = data.private;
  const isSelf = data.isSelf;
  const initial = (author?.username ?? "?").charAt(0).toUpperCase();
  const counts = data.counts;
  const ownedCount = data.owned?.total ?? 0;
  // Stats is a self-only tab (it includes your private activity); it defaults
  // for you, Plays defaults for everyone else.
  const activeTab: Tab = tab ?? (isSelf ? "stats" : "plays");

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
              <OwnerControls isPublic={me?.publicProfile?.isPublic ?? true} />
            ) : (
              author?.username && <FriendButton username={author.username} />
            )}
          </div>
          {author?.realName && (
            <p className="mt-0.5 text-sm text-muted">{author.realName}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <Stat n={counts.plays} label="plays" />
            <Stat n={counts.lists} label="lists" />
            <Stat n={ownedCount} label="owned" />
            <button
              onClick={() => setFriendsOpen(true)}
              className="text-muted transition-colors hover:text-foreground"
            >
              <b className="text-foreground">{counts.friends}</b> friends
            </button>
          </div>
        </div>
      </div>

      {isPrivate ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <Lock className="mx-auto h-7 w-7 text-subtle" />
          <p className="mt-3 font-medium">This profile is private.</p>
          <p className="mt-1 text-sm">
            Add {author?.username ?? "them"} as a friend to see their plays,
            lists and collection.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 flex border-b border-border">
            {isSelf && (
              <TabBtn
                active={activeTab === "stats"}
                onClick={() => setTab("stats")}
                icon={BarChart3}
                label="Stats"
              />
            )}
            <TabBtn
              active={activeTab === "plays"}
              onClick={() => setTab("plays")}
              icon={Dices}
              label="Plays"
            />
            <TabBtn
              active={activeTab === "lists"}
              onClick={() => setTab("lists")}
              icon={Trophy}
              label="Lists"
            />
            <TabBtn
              active={activeTab === "collection"}
              onClick={() => setTab("collection")}
              icon={Package}
              label="Collection"
            />
          </div>

          <div className="mt-5">
            {activeTab === "stats" && isSelf && <StatsPanel />}
            {activeTab === "plays" &&
              (isSelf ? <MyPlaysFeed /> : <PlaysList plays={plays} />)}
            {activeTab === "lists" &&
              (isSelf ? <MyListsGrid /> : <ListsGrid lists={lists} />)}
            {activeTab === "collection" && (
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

      <FriendsSheet
        open={friendsOpen}
        onClose={() => setFriendsOpen(false)}
        username={username}
        isSelf={isSelf}
      />

      {/* The Lists tab's floating action (your own profile). Plays has its own
          FAB inside MyPlaysFeed; Stats + Collection have none. */}
      {isSelf && !isPrivate && activeTab === "lists" && (
        <Fab
          icon={Plus}
          label="New list"
          onClick={() => setCreateListOpen(true)}
        />
      )}
      {isSelf && (
        <CreateListDrawer
          open={createListOpen}
          onClose={() => setCreateListOpen(false)}
        />
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

/** The owner's controls: one Public/Private toggle + a gear menu. */
function OwnerControls({ isPublic }: { isPublic: boolean }) {
  const setPublicProfile = useMutation(api.users.setPublicProfile);
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try {
      await setPublicProfile({ isPublic: !isPublic });
      toast(
        isPublic ? "Profile is now private." : "Profile is now public.",
        "success",
      );
    } catch {
      toast("Couldn't update.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggle}
        disabled={saving}
        className={buttonClasses("subtle", "sm")}
        title={isPublic ? "Make private" : "Make public"}
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPublic ? (
          <Globe className="h-4 w-4" />
        ) : (
          <Lock className="h-4 w-4" />
        )}
        {isPublic ? "Public" : "Private"}
      </button>
      <ProfileMenu />
    </div>
  );
}

const MENU_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

/** The owner's gear menu — settings, notifications, sign out. */
function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { signOut } = useAuthActions();
  const router = useRouter();

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

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    router.push("/");
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Profile menu"
        aria-expanded={open}
        className={buttonClasses("ghost", "sm")}
      >
        <Settings2 className="h-4 w-4" />
      </button>
      {open && (
        <div className="animate-in absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-border bg-surface p-1 shadow-xl">
          {MENU_ITEMS.map((it) => {
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <Icon className="h-4 w-4 shrink-0" />
                {it.label}
              </Link>
            );
          })}
          <div className="my-1 border-t border-border" />
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-red-500"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </div>
      )}
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

function PlaysList({ plays }: { plays: Plays | undefined }) {
  if (plays === undefined)
    return <Skeleton className="h-40 w-full rounded-xl" />;
  if (plays.length === 0) return <EmptyTab text="No public plays yet." />;
  return (
    <ul className="space-y-3">
      {plays.map((p) => (
        <li key={p._id}>
          <PlayPostCard play={p} />
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

/** Your own Lists tab — every list you own, drafts included (public browsing of
 *  another user's lists uses ListsGrid). Create via the tab's floating button. */
function MyListsGrid() {
  const lists = useQuery(api.topGames.listMine);
  if (lists === undefined)
    return <Skeleton className="h-40 w-full rounded-xl" />;
  if (lists.length === 0)
    return (
      <EmptyTab text="No lists yet — tap + to build your first Top Games list." />
    );
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
      <EmptyTab text="No collection shared. Turn on Owned / For Sale / Wishlist in Settings to show them here." />
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
        icon={Tag}
        title="For Sale"
        section={forTrade}
        href={`/user/${username}/for-sale`}
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
