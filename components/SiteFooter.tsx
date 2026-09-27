"use client";

import { usePathname } from "next/navigation";
import { useConvexAuth } from "convex/react";
import { Footer } from "./Footer";

export function SiteFooter() {
  const pathname = usePathname() ?? "";
  const { isAuthenticated, isLoading } = useConvexAuth();
  // The footer appears on the logged-out home/landing page only (not on the
  // signed-in dashboard). Wait for auth to resolve so it never flashes under
  // the dashboard while loading.
  const show = pathname === "/" && !isLoading && !isAuthenticated;
  if (!show) return null;
  return <Footer />;
}
