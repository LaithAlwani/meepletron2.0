import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private / user-specific pages. "/plays$" blocks the personal "My plays"
      // index only — the public "/plays/<id>" detail pages stay crawlable.
      disallow: [
        "/admin",
        "/api",
        "/unauthorized",
        "/profile",
        "/settings",
        "/collection",
        "/favorites",
        "/chats",
        "/plays$",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
