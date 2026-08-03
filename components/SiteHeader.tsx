"use client";

import { usePathname } from "next/navigation";
import { Header } from "./Header";

export function SiteHeader() {
  const pathname = usePathname();
  // The maintenance wall at "/" is standalone (no nav that reveals the app).
  if (pathname === "/") return null;
  // The chat page has its own game-specific navbar.
  if (/^\/boardgames\/[^/]+\/chat/.test(pathname ?? "")) return null;
  return <Header />;
}
