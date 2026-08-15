import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/** Turn a title into a URL-safe slug. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Slugify, then suffix until the slug is free.
 *
 * `slugify` alone is fine for hand-entered games, where an admin notices a
 * clash. Collection sync inserts hundreds of games unattended, where duplicate
 * titles (reprints, same-named games from different years) are a certainty —
 * and `games.by_slug` lookups use `.first()`, so a collision would silently
 * shadow one game with another.
 *
 * Both the probe and the eventual insert must happen in the same mutation:
 * Convex's OCC then makes two concurrent syncs claiming the same slug conflict
 * and retry, rather than both winning.
 */
export async function slugifyUnique(
  ctx: MutationCtx,
  title: string,
  /** The game being renamed, so its own current slug doesn't count as taken. */
  exceptId?: Id<"games">,
): Promise<string> {
  const base = slugify(title) || "game";
  let candidate = base;
  // Bounded: a title with 50 collisions is a data problem, not a naming one.
  for (let n = 2; n < 50; n++) {
    const taken = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .first();
    if (!taken || taken._id === exceptId) return candidate;
    candidate = `${base}-${n}`;
  }
  // Last resort: creation-time suffix. Unique in practice and still readable.
  return `${base}-${Date.now().toString(36)}`;
}
