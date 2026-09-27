"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import type { FunctionReturnType } from "convex/server";
import {
  Package,
  Tag,
  Heart,
  Archive,
  Lock,
  Globe,
  Settings,
  Bell,
  LogOut,
  Loader2,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/Surface";
import { buttonClasses } from "@/components/ui/Button";
import { CoverScroller } from "@/components/top-games/CoverScroller";
import { useScrollRestore } from "@/components/lib/useScrollRestore";
import { useToast } from "@/components/ui/Toast";

export default function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const data = useQuery(api.topGames.publicProfile, { username });
  const me = useQuery(api.users.me);

  if (data === undefined) {
    return (
      <div className="mx-auto max-w-2xl px-4 pb-8 pt-3 nav:pt-8">
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
      <div className="mx-auto max-w-2xl px-4 pb-8 pt-3 nav:pt-8">
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <p className="font-medium">No such user.</p>
          <Link href="/boardgames" className={`mt-4 ${buttonClasses("ghost", "sm")}`}>
            Back to the Library
          </Link>
        </div>
      </div>
    );
  }

  const { author } = data;
  const isPrivate = data.private;
  const isSelf = data.isSelf;
  const initial = (author?.username ?? "?").charAt(0).toUpperCase();
  const ownedCount = data.owned?.total ?? 0;
  const wishlistCount = data.wishlist?.total ?? 0;
  const forSaleCount = data.forTrade?.total ?? 0;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 pt-3 nav:pt-8">
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
            {isSelf && (
              <OwnerControls isPublic={me?.publicProfile?.isPublic ?? true} />
            )}
          </div>
          {author?.realName && (
            <p className="mt-0.5 text-sm text-muted">{author.realName}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <Stat n={ownedCount} label="owned" />
            <Stat n={wishlistCount} label="wishlist" />
            <Stat n={forSaleCount} label="for sale" />
          </div>
        </div>
      </div>

      {isPrivate ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <Lock className="mx-auto h-7 w-7 text-subtle" />
          <p className="mt-3 font-medium">This profile is private.</p>
        </div>
      ) : (
        <div className="mt-6">
          <CollectionShelves
            username={username}
            owned={data.owned}
            forTrade={data.forTrade}
            wishlist={data.wishlist}
            prevOwned={data.prevOwned}
          />
        </div>
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

type Section = NonNullable<
  FunctionReturnType<typeof api.topGames.publicProfile>
>["owned"];

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

function CollectionShelves({
  username,
  owned,
  forTrade,
  wishlist,
  prevOwned,
}: {
  username: string;
  owned: Section;
  forTrade: Section;
  wishlist: Section;
  prevOwned: Section;
}) {
  // Restore page scroll when returning from a game's detail page. The previews
  // are bounded, so gate on how many covers have rendered.
  const rendered =
    (owned?.items.length ?? 0) +
    (forTrade?.items.length ?? 0) +
    (wishlist?.items.length ?? 0) +
    (prevOwned?.items.length ?? 0);
  const { restoreIfReady, save } = useScrollRestore(
    `profile-collection:${username}`,
    1,
  );
  useEffect(() => {
    restoreIfReady(rendered);
  }, [rendered, restoreIfReady]);

  const empty =
    (owned?.total ?? 0) === 0 &&
    (forTrade?.total ?? 0) === 0 &&
    (wishlist?.total ?? 0) === 0 &&
    (prevOwned?.total ?? 0) === 0;
  if (empty) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
        No collection shared. Turn on Owned / For Sale / Wishlist in Settings to
        show them here.
      </p>
    );
  }
  return (
    <div
      className="space-y-6"
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest("a")) save(rendered);
      }}
    >
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
      <CollectionBlock
        icon={Archive}
        title="Previously owned"
        section={prevOwned}
        href={`/user/${username}/prev-owned`}
      />
    </div>
  );
}
