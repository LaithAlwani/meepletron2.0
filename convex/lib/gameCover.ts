import type { Id } from "../_generated/dataModel";
import { publicUrl } from "./r2keys";

/** A ctx that can resolve storage ids — query, mutation, or action. */
type StorageCtx = {
  storage: { getUrl(id: Id<"_storage">): Promise<string | null> };
};

/** The cover-relevant fields on a game (subset of the doc). */
type CoverGame = {
  imageKey?: string | null;
  thumbnailKey?: string | null;
  imageId?: Id<"_storage"> | null;
  thumbnailId?: Id<"_storage"> | null;
  bggImageUrl?: string | null;
  bggThumbUrl?: string | null;
};

/**
 * Resolve one stored cover URL, preferring OUR copy — R2 CDN key first, then the
 * legacy Convex blob — and only falling back to the BoardGameGeek CDN URL when we
 * have no stored copy. Serving our own covers keeps them cacheable and immune to
 * BGG rotating/removing images or blocking hotlinks.
 */
async function storedThenBgg(
  ctx: StorageCtx,
  key: string | null | undefined,
  storageId: Id<"_storage"> | null | undefined,
  bggUrl: string | null | undefined,
): Promise<string | null> {
  const cdn = publicUrl(key);
  if (cdn) return cdn;
  if (storageId) {
    const stored = await ctx.storage.getUrl(storageId);
    if (stored) return stored;
  }
  return bggUrl ?? null;
}

/**
 * Resolve a game's cover URLs. `imageUrl` = full cover (detail hero);
 * `thumbnailUrl` = small (cards/lists). Prefers our R2/Convex copy over BGG.
 */
export async function coverUrls(
  ctx: StorageCtx,
  g: CoverGame,
): Promise<{ imageUrl: string | null; thumbnailUrl: string | null }> {
  const [imageUrl, thumbnailUrl] = await Promise.all([
    storedThenBgg(ctx, g.imageKey, g.imageId, g.bggImageUrl),
    storedThenBgg(ctx, g.thumbnailKey, g.thumbnailId, g.bggThumbUrl),
  ]);
  return { imageUrl, thumbnailUrl };
}

/**
 * A single best "small" cover URL for list rows that show one image: our stored
 * thumbnail → our stored cover → BGG thumbnail → BGG full.
 */
export async function thumbUrl(ctx: StorageCtx, g: CoverGame): Promise<string | null> {
  const cdn = publicUrl(g.thumbnailKey) ?? publicUrl(g.imageKey);
  if (cdn) return cdn;
  const id = g.thumbnailId ?? g.imageId;
  if (id) {
    const stored = await ctx.storage.getUrl(id);
    if (stored) return stored;
  }
  return g.bggThumbUrl ?? g.bggImageUrl ?? null;
}
