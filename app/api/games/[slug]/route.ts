import { getGameCached } from "@/lib/gameCache";

/**
 * Game detail for the public game page, served from the hour-long server cache
 * (lib/gameCache) instead of a live Convex subscription per visitor. The CDN may
 * also keep it briefly, so repeat visits often don't reach the server at all.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const game = await getGameCached(slug);
  if (!game) {
    return Response.json(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(game, {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3000" },
  });
}
