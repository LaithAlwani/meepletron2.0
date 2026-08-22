"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * The profile now lives at /user/[username]. This route just forwards there —
 * or to Settings if you haven't picked a username yet (or aren't signed in).
 */
export default function ProfileRedirect() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/auth");
      return;
    }
    if (me === undefined) return; // still loading the profile
    router.replace(me?.username ? `/user/${me.username}` : "/settings");
  }, [isLoading, isAuthenticated, me, router]);

  return (
    <div className="px-4 py-16 text-center text-sm text-muted">Loading…</div>
  );
}
