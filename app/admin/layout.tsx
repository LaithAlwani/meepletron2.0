"use client";

import Link from "next/link";
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
        <h1 className="text-xl font-bold">Not authorized</h1>
        <p className="mt-2 text-sm text-muted">
          You need an admin account to view this area.
        </p>
        <Link
          href="/"
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
        <h1 className="text-2xl font-bold">Admin</h1>
        <nav className="mt-3 flex gap-1 overflow-x-auto border-b border-border">
          {adminNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium text-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
