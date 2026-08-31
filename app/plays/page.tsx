"use client";

import Link from "next/link";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { PageTitle } from "@/components/ui/PageTitle";
import { buttonClasses } from "@/components/ui/Button";
import { MyPlaysFeed } from "@/components/plays/MyPlaysFeed";

export default function PlaysPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <PageTitle className="mb-6">My plays</PageTitle>

      <AuthLoading>
        <PlaysSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">Sign in to record your plays.</p>
          <Link href="/auth" className={`mt-4 ${buttonClasses("primary", "sm")}`}>
            Sign in
          </Link>
        </div>
      </Unauthenticated>
      <Authenticated>
        <MyPlaysFeed />
      </Authenticated>
    </div>
  );
}

function PlaysSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="h-36 animate-pulse rounded-2xl border border-border-muted bg-surface"
        />
      ))}
    </ul>
  );
}
