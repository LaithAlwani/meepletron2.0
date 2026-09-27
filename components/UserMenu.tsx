"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Shield, MoreVertical, type LucideIcon } from "lucide-react";
import { ThemeMenu } from "@/components/ThemeToggle";
import { AvatarImg } from "@/components/ui/Avatar";

export function UserMenu({
  initial,
  avatarUrl,
  name,
  username,
  isAdmin,
}: {
  initial: string;
  avatarUrl?: string | null;
  name: string;
  username?: string | null;
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

  // Overflow items not already in the persistent nav (Library/Collection/Chats/
  // First player live in the header). Admin only, for admins.
  const items: { href: string; label: string; icon: LucideIcon }[] = [
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
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div className="animate-in absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-border bg-surface p-1.5 shadow-xl">
          {/* Identity header — mirrors the mobile "More" sheet. */}
          <div className="flex items-center gap-3 px-2.5 py-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/12 text-sm font-bold text-accent">
              <AvatarImg src={avatarUrl} initial={initial} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold leading-tight">{name}</p>
              {username && (
                <p className="truncate text-xs font-semibold text-accent">
                  @{username}
                </p>
              )}
            </div>
          </div>
          <div className="my-1 border-t border-border" />

          {items.map((it) => {
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
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
