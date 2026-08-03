"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useQuery } from "convex/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";

const ni = "h-[18px] w-[18px] shrink-0";
const GamesIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ni}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);
const TuckboxIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ni}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </svg>
);
const HeartIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ni}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
  </svg>
);
const AdminIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ni}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
const LoginIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ni}>
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <path d="m10 17 5-5-5-5" />
    <path d="M15 12H3" />
  </svg>
);
const ProfileIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ni}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

function NavLink({
  href,
  onClick,
  icon,
  children,
}: {
  href: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-accent/10 text-accent"
          : "text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/boardgames"
      onClick={onClick}
      aria-label="Meepletron home"
      className="flex items-center gap-2"
    >
      <Image
        src="/icons/icon-96x96.webp"
        alt=""
        width={32}
        height={32}
        priority
        className="h-8 w-8 rounded-md"
      />
      <span className="text-lg font-bold tracking-tight">Meepletron</span>
    </Link>
  );
}

export function Header() {
  const me = useQuery(api.users.me);
  const isAdmin = me?.role === "admin";
  const isGuest = me?.isAnonymous === true;
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Primary nav — shown in the desktop top bar and the mobile drawer.
  const mainLinks = (
    <>
      <NavLink href="/boardgames" onClick={close} icon={GamesIcon}>
        Games
      </NavLink>
      <NavLink href="/tuckbox" onClick={close} icon={TuckboxIcon}>
        Tuckbox
      </NavLink>
    </>
  );

  // Account links — desktop puts these in the avatar menu; mobile lists them.
  const accountLinks = (
    <>
      <Authenticated>
        <NavLink href="/favorites" onClick={close} icon={HeartIcon}>
          Favourites
        </NavLink>
      </Authenticated>
      {isAdmin && (
        <NavLink href="/admin" onClick={close} icon={AdminIcon}>
          Admin
        </NavLink>
      )}
    </>
  );

  const signInButton = (
    <Link
      href="/auth"
      onClick={close}
      className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
    >
      {LoginIcon}
      Sign in
    </Link>
  );

  const desktopAuth = (
    <>
      <AuthLoading>
        <div className="h-8 w-16 animate-pulse rounded-md bg-surface-2" />
      </AuthLoading>
      <Unauthenticated>{signInButton}</Unauthenticated>
      <Authenticated>
        {isGuest ? (
          signInButton
        ) : (
          <UserMenu
            initial={(me?.name || me?.email || "?").charAt(0).toUpperCase()}
            isAdmin={isAdmin}
          />
        )}
      </Authenticated>
    </>
  );

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <Logo />

          <nav className="ml-2 hidden flex-1 items-center gap-0.5 sm:flex">
            {mainLinks}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <div className="hidden sm:block">{desktopAuth}</div>
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-foreground sm:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile right drawer — rendered outside the blurred header so its
          background is solid and it can cover the full viewport. Kept mounted
          and animated so both open and close slide/fade. */}
      <div className={`fixed inset-0 z-50 sm:hidden ${open ? "" : "pointer-events-none"}`}>
          <div
            className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
            onClick={close}
          />
          <div
            className={`absolute right-0 top-0 flex h-dvh w-64 max-w-[80%] flex-col gap-1 border-l border-border bg-surface p-4 shadow-xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <Logo onClick={close} />
              <button
                onClick={close}
                aria-label="Close menu"
                className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            {mainLinks}
            {accountLinks}

            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <div className="flex-1">
                <AuthLoading>
                  <div className="h-9 animate-pulse rounded-md bg-surface-2" />
                </AuthLoading>
                <Unauthenticated>{signInButton}</Unauthenticated>
                <Authenticated>
                  {isGuest ? (
                    signInButton
                  ) : (
                    <NavLink href="/profile" onClick={close} icon={ProfileIcon}>
                      Profile
                    </NavLink>
                  )}
                </Authenticated>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </div>
    </>
  );
}
