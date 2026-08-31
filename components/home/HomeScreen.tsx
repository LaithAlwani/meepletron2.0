"use client";

import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { Skeleton } from "@/components/ui/Surface";
import { Dashboard } from "./Dashboard";
import { Landing } from "./Landing";

/** The home route: your dashboard when signed in, a marketing landing when not. */
export function HomeScreen() {
  return (
    <>
      <AuthLoading>
        <div className="mx-auto max-w-2xl px-4 py-8">
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </AuthLoading>
      <Authenticated>
        <div className="mx-auto max-w-2xl px-4 py-8">
          <Dashboard />
        </div>
      </Authenticated>
      <Unauthenticated>
        <Landing />
      </Unauthenticated>
    </>
  );
}
