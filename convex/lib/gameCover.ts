import type { Id } from "../_generated/dataModel";

/** A ctx that can resolve storage ids — query, mutation, or action. */
type StorageCtx = {
  storage: { getUrl(id: Id<"_storage">): Promise<string | null> };
};

/** The cover-relevant fields on a game (subset of the doc). */
type CoverGame = {
  imageId?: Id<"_storage"> | null;
  thumbnailId?: Id<"_storage"> | null;
  bggImageUrl?: string | null;
  bggThumbUrl?: string | null;
};

/**
 * Resolve a game's cover URLs, preferring the original BoardGameGeek CDN URL
 * (so BGG carries the image egress) and falling back to the Convex-stored blob
 * only when the BGG URL is missing (manual games, not-yet-backfilled rows).
 * `imageUrl` = full cover (detail hero); `thumbnailUrl` = small (cards/lists).
 */
export async function coverUrls(
  ctx: StorageCtx,
  g: CoverGame,
): Promise<{ imageUrl: string | null; thumbnailUrl: string | null }> {
  const imageUrl =
    g.bggImageUrl ?? (g.imageId ? await ctx.storage.getUrl(g.imageId) : null);
  const thumbnailUrl =
    g.bggThumbUrl ?? (g.thumbnailId ? await ctx.storage.getUrl(g.thumbnailId) : null);
  return { imageUrl, thumbnailUrl };
}

/**
 * A single best "small" cover URL for list rows that show one image: BGG
 * thumbnail → BGG full → stored thumbnail → stored full.
 */
export async function thumbUrl(ctx: StorageCtx, g: CoverGame): Promise<string | null> {
  if (g.bggThumbUrl) return g.bggThumbUrl;
  if (g.bggImageUrl) return g.bggImageUrl;
  const id = g.thumbnailId ?? g.imageId;
  return id ? await ctx.storage.getUrl(id) : null;
}
