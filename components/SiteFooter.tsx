"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./Footer";

export function SiteFooter() {
  const pathname = usePathname();
  // The footer only appears on the home / landing route.
  if (pathname !== "/") return null;
  return <Footer />;
}
