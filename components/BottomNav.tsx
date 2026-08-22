"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  LayoutGrid,
  Trophy,
  MessageCircle,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { MoreSheet } from "@/components/MoreSheet";

const TABS = [
  { href: "/feed", label: "Home", icon: Home },
  { href: "/boardgames", label: "Library", icon: LayoutGrid },
  { href: "/top-games", label: "Top Games", icon: Trophy },
  { href: "/chats", label: "Chats", icon: MessageCircle },
];

/**
 * Mobile-only bottom tab bar (the primary nav on small screens). Hidden on the
 * chat (own shell) and auth routes. The last tab is "More" (⋯), which opens the
 * former header avatar menu as a bottom sheet. Renders a matching in-flow spacer
 * so the fixed bar never covers page content.
 */
export function BottomNav() {
  const pathname = usePathname() ?? "";
  const [moreOpen, setMoreOpen] = useState(false);
  const hidden =
    pathname === "/" ||
    pathname === "/auth" ||
    pathname === "/who-goes-first" ||
    /^\/boardgames\/[^/]+\/chat/.test(pathname);
  if (hidden) return null;

  return (
    <>
      <div
        aria-hidden
        className="h-[calc(3.25rem+env(safe-area-inset-bottom))] sm:hidden"
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
            <button
              onClick={() => setMoreOpen(true)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              className={cn(
                "flex h-13 w-full flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors",
                moreOpen ? "text-accent" : "text-subtle hover:text-muted",
              )}
            >
              <MoreHorizontal
                className="h-4.5 w-4.5"
                strokeWidth={moreOpen ? 2.4 : 2}
              />
              More
            </button>
          </li>
        </ul>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
