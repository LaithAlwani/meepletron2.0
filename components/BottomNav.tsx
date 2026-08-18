"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import {
  LayoutGrid,
  MessageCircle,
  Trophy,
  CircleUser,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/boardgames", label: "Library", icon: LayoutGrid },
  { href: "/chats", label: "Chats", icon: MessageCircle },
  { href: "/top-games", label: "Top Games", icon: Trophy },
];

/**
 * Mobile-only bottom tab bar (the primary nav on small screens). Hidden on the
 * splash, chat (own shell), and auth routes. The collection now lives inside the
 * library, so its old slot became the profile avatar. Renders a matching in-flow
 * spacer so the fixed bar never covers page content.
 */
export function BottomNav() {
  const pathname = usePathname() ?? "";
  const me = useQuery(api.users.me);
  const hidden =
    pathname === "/" ||
    pathname === "/auth" ||
    pathname === "/who-goes-first" ||
    /^\/boardgames\/[^/]+\/chat/.test(pathname);
  if (hidden) return null;

  const profileActive =
    pathname === "/profile" || pathname.startsWith("/profile/");

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
            <Link
              href="/profile"
              aria-current={profileActive ? "page" : undefined}
              className={cn(
                "flex h-13 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors",
                profileActive ? "text-accent" : "text-subtle hover:text-muted",
              )}
            >
              {me?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={me.avatarUrl}
                  alt=""
                  className={cn(
                    "h-5 w-5 rounded-full object-cover",
                    profileActive && "ring-2 ring-accent",
                  )}
                />
              ) : (
                <CircleUser
                  className="h-4.5 w-4.5"
                  strokeWidth={profileActive ? 2.4 : 2}
                />
              )}
              Profile
            </Link>
          </li>
        </ul>
      </nav>
    </>
  );
}
