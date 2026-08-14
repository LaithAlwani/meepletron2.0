"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./Footer";

export function SiteFooter() {
  const pathname = usePathname();
  // The maintenance wall at "/" is standalone.
  if (pathname === "/") return null;
  // Hide the footer on the full-height chat page.
  if (/^\/boardgames\/[^/]+\/chat/.test(pathname ?? "")) return null;
  // The tuckbox generator is a full-view tool.
  if (pathname === "/tuckbox") return null;
  // The "who goes first" tool is a full-screen touch tool.
  if (pathname === "/who-goes-first") return null;
  return <Footer />;
}
