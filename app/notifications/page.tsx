"use client";

import Link from "next/link";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { PageTitle } from "@/components/ui/PageTitle";
import { buttonClasses } from "@/components/ui/Button";
import { NotificationsList } from "@/components/notifications/NotificationsBell";

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-xl px-4 pb-8 pt-3 nav:pt-8">
      <PageTitle className="hidden nav:block">Notifications</PageTitle>
      <div className="overflow-hidden rounded-2xl border border-border-muted bg-surface nav:mt-6">
        <AuthLoading>
          <p className="px-4 pb-8 pt-3 nav:pt-8 text-center text-sm text-subtle">Loading…</p>
        </AuthLoading>
        <Unauthenticated>
          <div className="px-4 pb-10 pt-3 nav:pt-10 text-center">
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
