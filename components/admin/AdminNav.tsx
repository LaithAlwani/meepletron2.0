"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import {
  LayoutDashboard,
  Gamepad2,
  BarChart3,
  Settings,
  Search,
  Inbox,
  Users,
  ChevronsLeft,
  ChevronsRight,
  X,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";

const adminNav: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/boardgames", label: "Games", icon: Gamepad2 },
  { href: "/admin/usage", label: "Usage", icon: BarChart3 },
  { href: "/admin/site-config", label: "Config", icon: Settings },
  { href: "/admin/searches", label: "Searches", icon: Search },
  { href: "/admin/requests", label: "Requests", icon: Inbox },
  { href: "/admin/users", label: "Users", icon: Users },
];

// Stick just below the sticky site header (its height + the mobile safe area).
const STICKY_TOP = "top-[calc(env(safe-area-inset-top)+3.75rem)]";

/** The admin nav links — icon + (optionally) label, active highlight, and the
 *  pending-requests badge. Shared by the desktop sidebar/rail and mobile drawer. */
function NavLinks({
  labels,
  pathname,
  requestCount,
  onNavigate,
}: {
  labels: boolean;
  pathname: string;
  requestCount: number | undefined;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {adminNav.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
        const badge =
          item.href === "/admin/requests" &&
          typeof requestCount === "number" &&
          requestCount > 0
            ? requestCount
            : null;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={labels ? undefined : item.label}
            className={cn(
              "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              labels ? "" : "justify-center",
              active
                ? "bg-accent/12 text-accent"
                : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            {labels && (
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            )}
            {badge !== null &&
              (labels ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold leading-none text-accent-foreground tabular-nums">
                  {badge}
                </span>
              ) : (
                <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-foreground tabular-nums">
                  {badge}
                </span>
              ))}
          </Link>
        );
      })}
    </nav>
  );
}

/** The admin sidebar: a sticky left rail that stays in view while the page
 *  content scrolls. Desktop collapses to an icon rail; mobile is an icon rail
 *  with a drawer for the full labels. Render as a flex sibling of the content. */
export function AdminNav() {
  const pathname = usePathname() ?? "/admin";
  const requestCount = useQuery(api.rulebookRequests.pendingRequestCount, {});
  // Desktop icon-rail collapse, remembered across visits. Read lazily (no
  // setState-in-effect); the desktop aside suppresses the hydration diff.
  const [collapsed, setCollapsed] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem("adminNavCollapsed") === "1",
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("adminNavCollapsed", next ? "1" : "0");
      } catch {
        /* private mode — fine */
      }
      return next;
    });

  return (
    <>
      {/* Desktop sidebar — sticky, collapses to an icon rail. */}
      <aside
        suppressHydrationWarning
        className={cn(
          "sticky hidden shrink-0 flex-col self-start transition-[width] duration-200 sm:flex",
          STICKY_TOP,
          collapsed ? "w-17" : "w-56",
        )}
      >
        <div
          className={cn(
            "mb-3 flex items-center px-2",
            collapsed ? "justify-center" : "justify-between",
          )}
        >
          {!collapsed && (
            <span className="font-display text-lg font-extrabold">Admin</span>
          )}
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </button>
        </div>
        <NavLinks
          labels={!collapsed}
          pathname={pathname}
          requestCount={requestCount}
        />
      </aside>

      {/* Mobile icon rail — sticky; the bottom arrow opens the full menu. */}
      <aside
        className={cn(
          "sticky flex shrink-0 flex-col self-start sm:hidden",
          STICKY_TOP,
        )}
      >
        <NavLinks labels={false} pathname={pathname} requestCount={requestCount} />
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="mt-1 flex items-center justify-center rounded-lg px-3 py-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </aside>

      {/* Mobile full-label drawer. */}
      <Sheet open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <span className="font-display text-lg font-bold">Admin</span>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="p-3">
          <NavLinks
            labels
            pathname={pathname}
            requestCount={requestCount}
            onNavigate={() => setDrawerOpen(false)}
          />
        </div>
      </Sheet>
    </>
  );
}
