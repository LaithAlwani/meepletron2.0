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
import { LayoutGrid, Scissors, LogIn } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/boardgames", label: "Library", icon: LayoutGrid },
  { href: "/tuckbox", label: "Tuckbox", icon: Scissors },
];

function Brand() {
  return (
    <Link
      href="/boardgames"
      aria-label="Meepletron home"
      className="flex items-center gap-2"
    >
      <Image
        src="/icons/icon-96x96.webp"
        alt=""
        width={32}
        height={32}
        priority
        className="h-8 w-8 rounded-lg"
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

  const signIn = (
    <Link href="/auth" className={buttonClasses("primary", "sm")}>
      <LogIn className="h-4 w-4" />
      Sign in
    </Link>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
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
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <AuthLoading>
            <div className="h-9 w-9 animate-pulse rounded-full bg-surface-2" />
          </AuthLoading>
          <Unauthenticated>{signIn}</Unauthenticated>
          <Authenticated>
            {isGuest ? (
              signIn
            ) : (
              <UserMenu
                initial={(me?.name || me?.email || "?").charAt(0).toUpperCase()}
                isAdmin={isAdmin}
              />
            )}
          </Authenticated>
        </div>
      </div>
    </header>
  );
}
