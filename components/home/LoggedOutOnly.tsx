"use client";

import { useConvexAuth } from "convex/react";

/**
 * Renders its children only for signed-out visitors. During SSR (and for
 * crawlers/LLMs, which are signed out) the children render, so the content stays
 * indexable; once the client confirms a signed-in session they're removed.
 */
export function LoggedOutOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  if (isAuthenticated) return null;
  return <>{children}</>;
}
