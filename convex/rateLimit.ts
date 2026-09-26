import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { getCurrentUser } from "./lib/auth";

/**
 * Fixed-window rate limiting for public actions that cost real money or reach
 * third parties (BGG fetches, game creation).
 *
 * Two buckets per scope, both of which must have room:
 *  - **per caller** — the signed-in user (a guest counts as one), so a single
 *    account can't hammer an endpoint.
 *  - **global** — everybody together. This is the only bucket that constrains
 *    signed-out traffic, since an action can't see the client's IP and guests
 *    are cheap to mint. Sized to be generous for real use and still cap the
 *    worst case.
 *
 * Fixed windows (not sliding) on purpose: one row and one patch per call, no
 * per-request history to store or prune. The cost is that a caller can spend
 * two windows' worth across a window boundary — irrelevant at these limits.
 *
 * Admins are exempt.
 */

const HOUR = 60 * 60 * 1000;

type Bucket = { limit: number; windowMs: number };

/** Per-scope budgets. Keep windows at an hour so one prune pass clears them. */
const SCOPES: Record<string, { perCaller: Bucket; global: Bucket }> = {
  // Importing a game from BGG: one /thing fetch, a cover fetch and a new game
  // row. A person adding games by hand does a handful; 20 is well clear of that.
  import: {
    perCaller: { limit: 20, windowMs: HOUR },
    global: { limit: 120, windowMs: HOUR },
  },
};

export type RateLimitResult = { ok: true } | { ok: false; retryAfterMs: number };

/** Count one hit against `key`, returning whether it fits inside the window. */
async function hit(
  ctx: MutationCtx,
  key: string,
  { limit, windowMs }: Bucket,
): Promise<RateLimitResult> {
  const now = Date.now();
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  // No row, or the window has rolled over — start a fresh one.
  if (!row || now - row.windowStart >= windowMs) {
    if (row) {
      await ctx.db.patch("rateLimits", row._id, { windowStart: now, count: 1 });
    } else {
      await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 });
    }
    return { ok: true };
  }

  if (row.count < limit) {
    await ctx.db.patch("rateLimits", row._id, { count: row.count + 1 });
    return { ok: true };
  }

  return { ok: false, retryAfterMs: row.windowStart + windowMs - now };
}

/**
 * Consume one unit of `scope`'s budget for the calling identity.
 *
 * Internal: actions reach it with `ctx.runMutation`, which carries the caller's
 * auth, so the identity is derived here rather than passed in as an argument.
 *
 * Called from an action this runs as its own transaction, so the hit is
 * recorded even if the work that follows fails — a failed attempt still cost a
 * BGG request, so it should still count.
 */
export const consume = internalMutation({
  args: { scope: v.string() },
  handler: async (ctx, { scope }): Promise<RateLimitResult> => {
    const buckets = SCOPES[scope];
    if (!buckets) throw new Error(`Unknown rate limit scope: ${scope}`);

    const user = await getCurrentUser(ctx);
    if (user?.role === "admin") return { ok: true };

    // Global first: when it's exhausted there's no point spending a caller's
    // budget on a call that won't proceed.
    const globally = await hit(ctx, `${scope}:global`, buckets.global);
    if (!globally.ok) return globally;

    if (!user) return { ok: true }; // signed out — the global bucket is the cap
    return await hit(ctx, `${scope}:user:${user._id}`, buckets.perCaller);
  },
});

/** Longest window any scope uses — nothing older than this can still be live. */
const MAX_WINDOW_MS = Math.max(
  ...Object.values(SCOPES).flatMap((s) => [s.perCaller.windowMs, s.global.windowMs]),
);

/**
 * Daily: drop counters whose window has long since closed. Rows are keyed per
 * user, so without this the table grows with every guest who ever imported a
 * game. Bounded per run; the next run picks up whatever is left.
 */
export const pruneExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - MAX_WINDOW_MS;
    const stale = await ctx.db.query("rateLimits").take(500);
    for (const row of stale) {
      if (row.windowStart < cutoff) await ctx.db.delete("rateLimits", row._id);
    }
  },
});
