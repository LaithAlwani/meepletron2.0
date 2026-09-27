"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { LayoutGrid, Bookmark, MessageCircle, Crown } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AvatarImg } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/boardgames", label: "Library", icon: LayoutGrid },
  { href: "/collection", label: "Collection", icon: Bookmark },
  { href: "/chats", label: "Chats", icon: MessageCircle },
  { href: "/first-player", label: "First player", icon: Crown },
];

/**
 * Mobile-only bottom tab bar (the primary nav on small screens): Library, My
 * list, Chats, First player, Profile. Hidden on the chat (own shell) and auth
 * routes. Renders a matching in-flow spacer so the fixed bar never covers page
 * content.
 */
export function BottomNav() {
  const pathname = usePathname() ?? "";
  const me = useQuery(api.users.me);
  const hidden =
    // The home route (`/`) is chrome-free: the landing owns the whole screen.
    pathname === "/" ||
    pathname === "/auth" ||
    /^\/boardgames\/[^/]+\/chat/.test(pathname);
  if (hidden) return null;

  return (
    <>
      <div
        aria-hidden
        className="h-[calc(3.25rem+env(safe-area-inset-bottom))] nav:hidden"
      />
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur nav:hidden">
        <ul className="mx-auto flex max-w-md items-stretch">
          {TABS.map((t) => {
            const active =
              pathname === t.href || pathname.startsWith(t.href + "/");
            const Icon = t.icon;
            return (
              <li key={t.href} className="flex-1">
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-13 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors",
                    active ? "text-accent" : "text-subtle hover:text-muted",
                  )}
                >
                  <Icon className="h-4.5 w-4.5" strokeWidth={active ? 2.4 : 2} />
                  {t.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <Link
              href="/profile"
              aria-current={pathname.startsWith("/user/") ? "page" : undefined}
              className={cn(
                "flex h-13 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors",
                pathname.startsWith("/user/")
                  ? "text-accent"
                  : "text-subtle hover:text-muted",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center overflow-hidden rounded-full text-[9px] font-bold ring-1",
                  me ? "bg-accent/12 text-accent" : "bg-surface-2 text-muted",
                  pathname.startsWith("/user/")
                    ? "ring-accent"
                    : "ring-transparent",
                )}
              >
                <AvatarImg
                  src={me?.avatarUrl}
                  initial={
                    me
                      ? (me.name || me.email || "?").charAt(0).toUpperCase()
                      : undefined
                  }
                />
              </span>
              Profile
            </Link>
          </li>
        </ul>
      </nav>
    </>
  );
}
