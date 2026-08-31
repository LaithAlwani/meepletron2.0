"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  useQuery,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { Home, LayoutGrid, MessageCircle, Trophy, LogIn } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { UserMenu } from "@/components/UserMenu";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { AvatarImg } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/boardgames", label: "Library", icon: LayoutGrid },
  { href: "/top-games", label: "Top Games", icon: Trophy },
  { href: "/chats", label: "Chats", icon: MessageCircle },
];

function Brand() {
  return (
    <Link
      href="/"
      aria-label="Meepletron home"
      className="flex items-center gap-2"
    >
      <Image
        src="/logo.webp"
        alt=""
        width={128}
        height={160}
        priority
        quality={90}
        className="h-9 w-auto"
      />
      <span className="font-display text-xl font-extrabold tracking-tight">
        meepletron
      </span>
    </Link>
  );
}

export function Header() {
  const me = useQuery(api.users.me);
  const isAdmin = me?.role === "admin";
  const isGuest = me?.isAnonymous === true;
  const pathname = usePathname() ?? "";

  // Styled to mirror the "Sign out" button (bordered/muted), not a loud CTA.
  const signIn = (
    <Link
      href="/auth"
      className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted transition-all hover:bg-surface-2 hover:text-foreground"
    >
      <LogIn className="h-4 w-4" />
      Sign in
    </Link>
  );

  // Desktop only — on mobile the bottom nav + each page's own title/back link
  // replace the top bar, giving more room to the content.
  return (
    <header className="sticky top-0 z-30 hidden border-b border-border bg-background/80 backdrop-blur sm:block">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Brand />
        <nav className="ml-2 hidden flex-1 items-center gap-1 sm:flex">
          {NAV.map((n) => {
            const active =
              pathname === n.href || pathname.startsWith(n.href + "/");
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                  active
                    ? "text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        {/* Desktop only — on mobile these live in the bottom nav's "More" sheet. */}
        <div className="ml-auto hidden items-center gap-1.5 sm:flex">
          <AuthLoading>
            <div className="h-9 w-9 animate-pulse rounded-full bg-surface-2" />
          </AuthLoading>
          <Unauthenticated>
            <Link
              href="/profile"
              aria-label="Profile"
              title="Profile"
              className="flex items-center rounded-xl p-1 transition-colors hover:bg-surface-2"
            >
              <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-muted">
                <AvatarImg />
              </span>
            </Link>
            {signIn}
          </Unauthenticated>
          <Authenticated>
            {isGuest ? (
              signIn
            ) : (
              <>
                <NotificationsBell variant="header" />
                <Link
                  href="/profile"
                  aria-current={
                    pathname.startsWith("/user/") ? "page" : undefined
                  }
                  aria-label="Your profile"
                  className="flex items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-surface-2"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/12 text-sm font-bold text-accent">
                    <AvatarImg
                      src={me?.avatarUrl}
                      initial={(me?.name || me?.email || "?")
                        .charAt(0)
                        .toUpperCase()}
                    />
                  </span>
                  <div className="min-w-0 max-w-40 leading-tight">
                    <p className="truncate text-sm font-semibold">
                      {me?.name || me?.email || "Account"}
                    </p>
                    {me?.username && (
                      <p className="truncate text-xs font-semibold text-accent">
                        @{me.username}
                      </p>
                    )}
                  </div>
                </Link>
                <UserMenu
                  initial={(me?.name || me?.email || "?").charAt(0).toUpperCase()}
                  avatarUrl={me?.avatarUrl}
                  name={me?.name || me?.email || "Account"}
                  username={me?.username}
                  isAdmin={isAdmin}
                />
              </>
            )}
          </Authenticated>
        </div>
      </div>
    </header>
  );
}
