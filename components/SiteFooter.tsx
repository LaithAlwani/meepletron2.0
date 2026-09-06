"use client";

import { usePathname } from "next/navigation";
import { useConvexAuth } from "convex/react";
import { Footer } from "./Footer";

export function SiteFooter() {
  const pathname = usePathname() ?? "";
  const { isAuthenticated, isLoading } = useConvexAuth();
  // The footer appears on the About page, and on the logged-out home/landing
  // page (not on the signed-in dashboard). Wait for auth to resolve so it never
  // flashes under the dashboard while loading.
  const show =
    pathname === "/about" ||
    (pathname === "/" && !isLoading && !isAuthenticated);
  if (!show) return null;
  return <Footer />;
}
