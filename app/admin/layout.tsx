"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminNav } from "@/components/admin/AdminNav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = useQuery(api.users.me);

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
    <div className="mx-auto flex max-w-site gap-3 px-3 py-6 sm:gap-6 sm:px-4 sm:py-8">
      <AdminNav />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
