"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/boardgames", label: "Games" },
  { href: "/admin/usage", label: "Usage" },
  { href: "/admin/site-config", label: "Config" },
  { href: "/admin/searches", label: "Searches" },
  { href: "/admin/users", label: "Users" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = useQuery(api.users.me);
  const pathname = usePathname();

  if (me === undefined) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-muted">
        Loading…
      </div>
    );
  }

  if (!me || me.role !== "admin") {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-xl font-extrabold">Not authorized</h1>
        <p className="mt-2 text-sm text-muted">
          You need an admin account to view this area.
        </p>
        <Link
          href="/profile"
          className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          Back home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight">
          Admin
        </h1>
        <div className="mt-3 border-b border-border">
          <nav className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {adminNav.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "border-accent text-foreground"
                      : "border-transparent text-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
