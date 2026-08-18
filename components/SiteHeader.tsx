"use client";

import { usePathname } from "next/navigation";
import { Header } from "./Header";

export function SiteHeader() {
  const pathname = usePathname();
  // The chat page has its own game-specific navbar.
  if (/^\/boardgames\/[^/]+\/chat/.test(pathname ?? "")) return null;
  // The "who goes first" tool is a full-screen touch tool.
  if (pathname === "/who-goes-first") return null;
  return <Header />;
}
