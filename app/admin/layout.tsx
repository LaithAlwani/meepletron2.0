"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminSidebar, AdminMobileNav } from "@/components/admin/AdminNav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = useQuery(api.users.me);
  const pathname = usePathname() ?? "/admin";
  // The nav badge is a one-shot fetch, refreshed on navigation between admin
  // pages and on window focus — not a live subscription held open on every
  // admin page.
  const convex = useConvex();
  const isAdmin = me?.role === "admin";
  const [requestCount, setRequestCount] = useState<number | undefined>(
    undefined,
  );
  useEffect(() => {
    if (!isAdmin) return;
    const load = () => {
      convex.query(api.rulebookRequests.pendingRequestCount, {}).then(
        setRequestCount,
        () => {},
      );
    };
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [convex, isAdmin, pathname]);

  if (me === undefined) {
    return (
      <div className="mx-auto max-w-site px-4 py-16 text-center text-muted">
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
    <div className="mx-auto max-w-site px-3 py-6 sm:px-4 sm:py-8">
      {/* Mobile: a single menu button (upper corner) + drawer. */}
      <AdminMobileNav pathname={pathname} requestCount={requestCount} />
      <div className="sm:flex sm:gap-6">
        <AdminSidebar pathname={pathname} requestCount={requestCount} />
        <main className="min-w-0 sm:flex-1">{children}</main>
      </div>
    </div>
  );
}
