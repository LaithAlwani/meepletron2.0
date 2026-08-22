"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./Footer";

export function SiteFooter() {
  const pathname = usePathname();
  // The footer only appears on the feed (home) route.
  if (pathname !== "/feed") return null;
  return <Footer />;
}
