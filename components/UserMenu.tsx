"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  User,
  Scissors,
  Settings,
  Shield,
  Hand,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ThemeMenu } from "@/components/ThemeToggle";
import { AvatarImg } from "@/components/ui/Avatar";

export function UserMenu({
  initial,
  avatarUrl,
  isAdmin,
}: {
  initial: string;
  avatarUrl?: string | null;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Avoid duplicating links that already live in a persistent nav:
  //  - `bottomNav`: in the mobile tab bar → hide here on mobile, show on desktop.
  //  - `headerNav`: in the desktop header nav → hide here on desktop, show on mobile.
  // Chats/Favourites live in the header nav (desktop) + tab bar (mobile), so
  // they're not repeated here.
  const items: {
    href: string;
    label: string;
    icon: LucideIcon;
    bottomNav?: boolean;
    headerNav?: boolean;
    touchOnly?: boolean;
  }[] = [
    { href: "/profile", label: "Profile", icon: User },
    { href: "/tuckbox", label: "Tuckbox", icon: Scissors },
    { href: "/who-goes-first", label: "First Player", icon: Hand, touchOnly: true },
    { href: "/settings", label: "Settings", icon: Settings },
    ...(isAdmin
      ? [{ href: "/admin", label: "Admin", icon: Shield as LucideIcon }]
      : []),
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-accent/12 text-sm font-bold text-accent transition-colors hover:bg-accent/20"
      >
        <AvatarImg src={avatarUrl} initial={initial} />
      </button>
      {open && (
        <div className="animate-in absolute right-0 z-50 mt-2 w-48 rounded-2xl border border-border bg-surface p-1.5 shadow-xl">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground",
                  it.touchOnly
                    ? "hidden pointer-coarse:flex" // touch devices only (phones + tablets)
                    : it.bottomNav
                      ? "hidden sm:flex"
                      : it.headerNav
                        ? "flex sm:hidden"
                        : "flex",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {it.label}
              </Link>
            );
          })}

          <div className="my-1 border-t border-border" />
          <ThemeMenu />
        </div>
      )}
    </div>
  );
}
