/**
 * R2 object-key scheme + public URL builder.
 *
 * Keys are structured folders — organised by game *slug* (a human-readable name,
 * never a document id). Dev and prod are isolated by using separate buckets
 * (`R2_BUCKET` per Convex deployment), so keys need no environment prefix:
 *
 *   images/game/<gameSlug>/cover.jpg      (+ thumb.jpg)
 *   plays/images/<gameSlug>/<uuid>.jpg
 *   images/avatar/<userSlug>/<uuid>.jpg
 *   tuckboxes/<gameSlug>/<uuid>.<ext>
 *   rulebooks/<gameSlug>/<uuid>-<filename>
 *
 * `publicUrl` turns a key into a permanent, cacheable URL served from the R2
 * bucket's Cloudflare custom domain (egress-free). Signed URLs (`r2.getUrl`) are
 * used only for access-controlled files (rulebooks).
 */

/** Filesystem-safe fallback when a name is missing, keeping keys id-free-ish. */
function safe(segment: string): string {
  return (
    segment
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

export function gameCoverKey(gameSlug: string): string {
  return `images/game/${safe(gameSlug)}/cover.jpg`;
}

export function gameThumbKey(gameSlug: string): string {
  return `images/game/${safe(gameSlug)}/thumb.jpg`;
}

export function playPhotoKey(gameSlug: string, uuid: string): string {
  return `plays/images/${safe(gameSlug)}/${uuid}.jpg`;
}

export function avatarKey(userSlug: string, uuid: string): string {
  return `images/avatar/${safe(userSlug)}/${uuid}.jpg`;
}

export function tuckboxKey(gameSlug: string, uuid: string, ext = "jpg"): string {
  return `tuckboxes/${safe(gameSlug)}/${uuid}.${ext}`;
}

export function rulebookKey(gameSlug: string, filename: string): string {
  // Clean, uuid-free path so the download keeps its real name. Re-uploading a
  // same-named rulebook to the same game overwrites the previous file.
  return `rulebooks/${safe(gameSlug)}/${filename}`;
}

/** A permanent, cacheable public URL for a stored object (Cloudflare custom
 *  domain in front of the R2 bucket). Returns null when not configured. */
export function publicUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const base = process.env.R2_PUBLIC_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/${key}`;
}
