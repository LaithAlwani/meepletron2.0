import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { SITE_URL } from "@/lib/site";

// One day. The sitemap doesn't need to be fresher than this, and it caps how
// often we touch Convex no matter how hard crawlers hit /sitemap.xml.
const ONE_DAY = 86400;

// Regenerate the whole sitemap route at most once a day. (Must be a literal —
// Next statically analyses this segment config.)
export const revalidate = 86400;

// Static, public, indexable routes.
const ROUTES: {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/boardgames", changeFrequency: "daily", priority: 0.9 },
  { path: "/top-games", changeFrequency: "weekly", priority: 0.8 },
  { path: "/who-goes-first", changeFrequency: "monthly", priority: 0.7 },
  { path: "/tuckbox", changeFrequency: "monthly", priority: 0.6 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
];

// Cache the game-slug read in Next's data cache so the underlying Convex query
// (which loads every non-stub game document) runs at most once per day — not
// once per crawler request. This is the real bandwidth saver: the return payload
// is tiny, but the query reads full game docs, so we don't want it on every hit.
const getGameSlugs = unstable_cache(
  () => fetchQuery(api.games.sitemapSlugs, {}),
  ["sitemap-game-slugs"],
  { revalidate: ONE_DAY },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // Per-game detail pages (base games + expansions) — each now has its own
  // server metadata (app/boardgames/[slug]/layout.tsx), so they're indexable.
  let gameRoutes: MetadataRoute.Sitemap = [];
  try {
    const games = await getGameSlugs();
    gameRoutes = games.flatMap((g) => [
      {
        url: `${SITE_URL}/boardgames/${g.slug}`,
        lastModified: new Date(g.updatedAt),
        changeFrequency: "weekly" as const,
        priority: g.isExpansion ? 0.5 : 0.7,
      },
      // The "how to play" page — the rules/FAQ content, targeted at
      // "how to play X" / "X rules" searches.
      {
        url: `${SITE_URL}/boardgames/${g.slug}/how-to-play`,
        lastModified: new Date(g.updatedAt),
        changeFrequency: "weekly" as const,
        priority: g.isExpansion ? 0.5 : 0.8,
      },
    ]);
  } catch {
    // If Convex is unreachable at build/request time, still emit the static map.
  }

  return [...staticRoutes, ...gameRoutes];
}
