import { R2 } from "@convex-dev/r2";
import { components } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import type { MutationCtx, ActionCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Cloudflare R2 storage for all user media (avatars, game covers, play photos,
 * tuckbox art, rulebook files). Reads env vars `R2_BUCKET`, `R2_ENDPOINT`,
 * `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Object keys are structured folders
 * built in `lib/r2keys.ts`; public images are served from the bucket's Cloudflare
 * custom domain (`R2_PUBLIC_URL`), rulebooks via short-lived signed URLs.
 */
export const r2 = new R2(components.r2);

/**
 * Client-facing R2 API. We only expose `syncMetadata` — the client calls it
 * after PUTting a blob to a signed upload URL, to record the object's metadata.
 * Uploading requires an authenticated user; per-type authorization (admin /
 * ownership) stays on the existing attach mutations (setAvatar / addRulebook /
 * setGameImage / …), since an uploaded object is inert until one of those records
 * its key against a document.
 *
 * Deletes and metadata reads use the instance methods (`r2.deleteObject`,
 * `r2.getMetadata`) inside our own authorized functions — we deliberately do NOT
 * expose the clientApi `deleteObject`/`getMetadata`, which would be public and
 * unauthorized.
 */
export const { syncMetadata } = r2.clientApi<DataModel>({
  checkUpload: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
  },
});

/**
 * Delete a stored image/file from whichever store holds it — the R2 object
 * (preferred) or the legacy Convex blob. No-op when neither is set. Used by the
 * various cleanup paths (avatar eviction, cover replacement, play/tuckbox edits,
 * game deletion) so they work across the migration.
 */
export async function deleteMedia(
  ctx: MutationCtx | ActionCtx,
  key: string | null | undefined,
  storageId: Id<"_storage"> | null | undefined,
): Promise<void> {
  if (key) await r2.deleteObject(ctx, key);
  else if (storageId) await ctx.storage.delete(storageId);
}

/**
 * Read a stored file's raw bytes from whichever store holds it — R2 (via a
 * short-lived signed URL) or the legacy Convex blob. Action context only. Used
 * by the rulebook ingestion pipeline. Returns null when the file is missing.
 */
export async function readMediaBytes(
  ctx: ActionCtx,
  key: string | null | undefined,
  storageId: Id<"_storage"> | null | undefined,
): Promise<Uint8Array | null> {
  if (key) {
    const res = await fetch(await r2.getUrl(key));
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  }
  if (storageId) {
    const blob = await ctx.storage.get(storageId);
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
  }
  return null;
}
