"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, MessageCircle, Heart, User } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/boardgames", label: "Library", icon: LayoutGrid },
  { href: "/chats", label: "Chats", icon: MessageCircle },
  { href: "/favorites", label: "Favourites", icon: Heart },
  { href: "/profile", label: "Profile", icon: User },
];

/**
 * Mobile-only bottom tab bar (the primary nav on small screens). Hidden on the
 * splash, chat (own shell), and auth routes. Renders a matching in-flow spacer
 * so the fixed bar never covers page content.
 */
export function BottomNav() {
  const pathname = usePathname() ?? "";
  const hidden =
    pathname === "/" ||
    pathname === "/auth" ||
    /^\/boardgames\/[^/]+\/chat/.test(pathname);
  if (hidden) return null;

  return (
    <>
      <div
        aria-hidden
        className="h-[calc(4rem+env(safe-area-inset-bottom))] sm:hidden"
      />
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
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
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
                    active ? "text-accent" : "text-subtle hover:text-muted",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
