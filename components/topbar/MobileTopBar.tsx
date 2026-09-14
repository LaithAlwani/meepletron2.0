"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { useBackNav } from "@/components/ui/BackButton";
import { resolveTopBar } from "./routes";
import { cn } from "@/lib/cn";

/**
 * A title a page supplies for itself, tagged with the path it belongs to so a
 * route change never shows the previous page's title while the new page loads.
 */
type Override = { pathname: string; title: string; href?: string } | null;

const TitleCtx = createContext<{
  override: Override;
  setOverride: (o: Override) => void;
}>({ override: null, setOverride: () => {} });

export function TopBarTitleProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<Override>(null);
  return (
    <TitleCtx.Provider value={{ override, setOverride }}>
      {children}
    </TitleCtx.Provider>
  );
}

/**
 * Names the current page in the mobile top bar. For pages whose heading comes
 * from a query — a game, a play, a top-games list — call this with the title
 * once it's loaded (and `undefined` while it isn't).
 *
 * Pass `href` where the heading it replaces was itself a link (a play's title
 * links to the game), so hiding that heading on mobile doesn't strand the only
 * route to it.
 */
export function useTopBarTitle(
  title: string | undefined | null,
  href?: string | null,
) {
  const pathname = usePathname() ?? "";
  const { setOverride } = useContext(TitleCtx);
  useEffect(() => {
    if (!title) return;
    setOverride({ pathname, title, href: href ?? undefined });
    // Leaving the page drops the title, so it can't outlive the route.
    return () => setOverride(null);
  }, [pathname, title, href, setOverride]);
}

/**
 * The mobile top bar: back arrow, page title, notifications bell.
 *
 * Mobile only — it swaps in exactly where the desktop header drops out (the
 * `nav` breakpoint), so nothing above 867px changes. Sits above the notch via
 * the safe-area inset, and grows a bottom border once the page scrolls so it
 * separates from content without drawing a line across an unscrolled screen.
 */
export function MobileTopBar() {
  const pathname = usePathname() ?? "";
  const { override } = useContext(TitleCtx);
  const route = resolveTopBar(pathname);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  // `useBackNav` is a hook, so it has to run whether or not the bar renders.
  const onBack = useBackNav(route?.back ?? "/boardgames");

  if (!route) return null;

  const active = override && override.pathname === pathname ? override : null;
  const title = active ? active.title : route.title;
  const titleClass =
    "font-display min-w-0 flex-1 truncate text-center text-[17px] font-bold tracking-tight";

  return (
    <header
      className={cn(
        "sticky top-0 z-30 bg-background/85 backdrop-blur transition-colors nav:hidden",
        scrolled ? "border-b border-border" : "border-b border-transparent",
      )}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex h-13 items-center gap-1 px-1.5">
        {route.back === null ? (
          // Bottom-nav destinations have nowhere to go back to; the empty slot
          // keeps the title optically centred against the bell.
          <span aria-hidden className="h-11 w-11 shrink-0" />
        ) : (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-foreground transition-colors active:bg-surface-2"
          >
            <ChevronLeft className="h-6.5 w-6.5" strokeWidth={2.75} />
          </button>
        )}

        {active?.href ? (
          <Link href={active.href} className={titleClass}>
            {title}
          </Link>
        ) : (
          <h1 className={titleClass}>{title}</h1>
        )}

        {/* A fixed slot, so the title stays centred whether or not the bell
            renders (it returns nothing when signed out). */}
        <div className="flex h-11 w-11 shrink-0 items-center justify-center">
          <NotificationsBell variant="bar" />
        </div>
      </div>
    </header>
  );
}
