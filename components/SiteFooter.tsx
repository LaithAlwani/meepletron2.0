"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./Footer";

export function SiteFooter() {
  const pathname = usePathname();
  // Hide the footer on the full-height chat page.
  if (/^\/boardgames\/[^/]+\/chat/.test(pathname ?? "")) return null;
  return <Footer />;
}
