"use client";

import { usePathname } from "next/navigation";
import { Header } from "./Header";

export function SiteHeader() {
  const pathname = usePathname();
  // The chat page has its own game-specific navbar; everywhere else (including
  // the landing) shows the main nav. The nav's own auth area resolves from a
  // loading skeleton, so a signed-in visitor never sees signed-out chrome.
  if (/^\/boardgames\/[^/]+\/chat/.test(pathname)) return null;
  return <Header />;
}
