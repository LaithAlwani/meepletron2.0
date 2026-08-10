"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MessageCircle,
  Heart,
  User,
  Scissors,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

export function UserMenu({
  initial,
  isAdmin,
}: {
  initial: string;
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

  // `bottomNav` items are already reachable from the mobile tab bar, so they're
  // hidden here on small screens and only shown on desktop (which has no bar).
  const items: {
    href: string;
    label: string;
    icon: LucideIcon;
    bottomNav?: boolean;
  }[] = [
    { href: "/chats", label: "Chats", icon: MessageCircle, bottomNav: true },
    { href: "/favorites", label: "Favourites", icon: Heart, bottomNav: true },
    { href: "/tuckbox", label: "Tuckbox", icon: Scissors },
    { href: "/profile", label: "Profile", icon: User, bottomNav: true },
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
        className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/12 text-sm font-bold text-accent transition-colors hover:bg-accent/20"
      >
        {initial}
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
                  it.bottomNav ? "hidden sm:flex" : "flex",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {it.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
