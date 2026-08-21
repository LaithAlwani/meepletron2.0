"use client";

import Link from "next/link";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { PageTitle } from "@/components/ui/PageTitle";
import { buttonClasses } from "@/components/ui/Button";
import { NotificationsList } from "@/components/notifications/NotificationsBell";

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <PageTitle>Notifications</PageTitle>
      <div className="mt-6 overflow-hidden rounded-2xl border border-border-muted bg-surface">
        <AuthLoading>
          <p className="px-4 py-8 text-center text-sm text-subtle">Loading…</p>
        </AuthLoading>
        <Unauthenticated>
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-muted">Sign in to see your notifications.</p>
            <Link href="/auth" className={`mt-4 ${buttonClasses("primary", "sm")}`}>
              Sign in
            </Link>
          </div>
        </Unauthenticated>
        <Authenticated>
          <NotificationsList />
        </Authenticated>
      </div>
    </div>
  );
}
