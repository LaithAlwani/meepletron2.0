import type { Id } from "../_generated/dataModel";
import { publicUrl } from "./r2keys";

/** A ctx that can resolve legacy Convex storage ids (query/mutation/action). */
type StorageReader = {
  storage: { getUrl(id: Id<"_storage">): Promise<string | null> };
};

/**
 * Resolve a public image URL during (and after) the R2 migration: prefer the R2
 * object key — a permanent, cacheable URL from our CDN — and fall back to the
 * legacy Convex blob only until the backfill has moved it. Returns null when
 * neither is set (or `R2_PUBLIC_URL` is unconfigured and there is no legacy blob).
 */
export async function imageUrl(
  ctx: StorageReader,
  key: string | null | undefined,
  storageId: Id<"_storage"> | null | undefined,
): Promise<string | null> {
  const cdn = publicUrl(key);
  if (cdn) return cdn;
  return storageId ? await ctx.storage.getUrl(storageId) : null;
}
