"use client";

import { usePathname } from "next/navigation";
import { useConvexAuth } from "convex/react";
import { Header } from "./Header";

export function SiteHeader() {
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  // Signed out, the root is the marketing landing — a self-contained hero with
  // its own wordmark and CTAs, so it gets no top bar. Signed in it's the
  // dashboard, which needs the nav like every other page.
  if (pathname === "/" && !isAuthenticated) return null;
  // The chat page has its own game-specific navbar.
  if (/^\/boardgames\/[^/]+\/chat/.test(pathname)) return null;
  // The "who goes first" tool is a full-screen touch tool.
  if (pathname === "/who-goes-first") return null;
  return <Header />;
}
