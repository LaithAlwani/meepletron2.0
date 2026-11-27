import { cache } from "react";
import { unstable_cache } from "next/cache";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

/** Game details for server rendering (metadata, JSON-LD, how-to-play), cached. */
export type CachedGame = NonNullable<Awaited<ReturnType<typeof fetchGame>>>;

const ONE_HOUR = 60 * 60;

/** Thrown (not returned) so a "not found" is never cached: a newly added game appears at once. */
class NotFound extends Error {}

async function fetchGame(slug: string) {
  return fetchQuery(api.games.getByHandle, { handle: slug });
}

/**
 * `getByHandle` is a heavy read (the game + up to 100 expansions + 50 rulebooks).
 * Server pages for a game (layout metadata + JSON-LD, how-to-play, chat
 * metadata) and every crawler / link-preview hit used to each run it straight
 * against Convex, 2-3 times per page view. This keeps one copy per game in
 * Next's data cache for an hour (`unstable_cache`, the same tool app/sitemap.ts
 * uses; the project doesn't enable Cache Components, so `"use cache"` isn't
 * available), so most views cost Convex nothing. Tag `game:<slug>` lets an edit
 * flow call revalidateTag later if an hour of staleness ever matters.
 */
const getCached = (slug: string) =>
  unstable_cache(
    async () => {
      const game = await fetchGame(slug);
      if (!game) throw new NotFound(slug);
      return game;
    },
    ["game-by-handle", slug],
    { revalidate: ONE_HOUR, tags: ["games", `game:${slug}`] },
  )();

/**
 * One fetch per request, shared by generateMetadata, layouts and pages
 * (React `cache` dedupes within the request; `unstable_cache` across requests).
 * Resolves to null when the game doesn't exist or Convex is unreachable.
 */
export const getGameCached = cache(async (slug: string): Promise<CachedGame | null> => {
  try {
    return await getCached(slug);
  } catch {
    return null;
  }
});
