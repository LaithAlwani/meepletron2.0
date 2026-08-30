"use client";

import { Sheet } from "@/components/ui/Sheet";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import {
  User,
  Scissors,
  Hand,
  Shield,
  Info,
  X,
  LogIn,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AvatarImg } from "@/components/ui/Avatar";
import { ThemeMenu } from "@/components/ThemeToggle";
import { cn } from "@/lib/cn";

/**
 * The mobile "More" menu — the former header avatar dropdown, moved into a
 * bottom sheet opened from the bottom nav's "More" tab. Mobile only (the desktop
 * header keeps its avatar menu).
 */
export function MoreSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const me = useQuery(api.users.me);
  const pathname = usePathname() ?? "";

  const signedIn = !!me && me.isAnonymous !== true;
  const name = me?.name || me?.email || "Guest";
  const initial = (me?.name || me?.email || "?").charAt(0).toUpperCase();

  const items: { href: string; label: string; icon: LucideIcon }[] = [
    {
      href: me?.username ? `/user/${me.username}` : "/profile",
      label: "Profile",
      icon: User,
    },
    { href: "/tuckbox", label: "Tuckbox", icon: Scissors },
    { href: "/who-goes-first", label: "Who goes first", icon: Hand },
    { href: "/about", label: "About", icon: Info },
    ...(me?.role === "admin"
      ? [{ href: "/admin", label: "Admin", icon: Shield as LucideIcon }]
      : []),
  ];

  return (
    <Sheet open={open} onClose={onClose} mobileMaxH="max-h-[85vh]">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          {signedIn ? (
            <>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/12 text-sm font-bold text-accent">
                <AvatarImg src={me?.avatarUrl} initial={initial} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight">{name}</p>
                {me?.username && (
                  <p className="truncate text-xs font-semibold text-accent">
                    @{me.username}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="flex-1 font-display text-lg font-bold">More</p>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="themed-scroll flex-1 overflow-y-auto p-2">
          {signedIn ? (
            items.map((it) => {
              const Icon = it.icon;
              const active =
                pathname === it.href || pathname.startsWith(it.href + "/");
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent/10 text-accent"
                      : "text-foreground hover:bg-surface-2",
                  )}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0 text-muted" />
                  {it.label}
                </Link>
              );
            })
          ) : (
            <div className="space-y-1 p-1">
              <Link
                href="/auth"
                onClick={onClose}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted transition-all hover:bg-surface-2 hover:text-foreground"
              >
                <LogIn className="h-4 w-4" />
                Sign in
              </Link>
              <Link
                href="/who-goes-first"
                onClick={onClose}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
              >
                <Hand className="h-4.5 w-4.5 shrink-0 text-muted" />
                Who goes first
              </Link>
              <Link
                href="/tuckbox"
                onClick={onClose}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
              >
                <Scissors className="h-4.5 w-4.5 shrink-0 text-muted" />
                Tuckbox
              </Link>
              <Link
                href="/about"
                onClick={onClose}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
              >
                <Info className="h-4.5 w-4.5 shrink-0 text-muted" />
                About
              </Link>
            </div>
          )}

          <div className="my-1 border-t border-border" />
          <ThemeMenu />
        </div>
    </Sheet>
  );
}
