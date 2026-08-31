"use client";

import { usePathname } from "next/navigation";
import { Footer } from "./Footer";

export function SiteFooter() {
  const pathname = usePathname() ?? "";
  // The footer only appears on the About page.
  if (pathname !== "/about") return null;
  return <Footer />;
}
