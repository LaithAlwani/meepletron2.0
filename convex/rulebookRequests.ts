import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireUser, requireAdmin } from "./lib/auth";
import { thumbUrl } from "./lib/gameCover";

const SITE_URL = process.env.SITE_URL || "https://www.meepletron.com";

/**
 * Request counts per game, keyed by gameId, for games that DON'T yet have an
 * ingested rulebook (fulfilled requests are excluded). Shared by the admin list
 * and the nav badge count.
 */
async function pendingCounts(
  ctx: QueryCtx,
): Promise<Map<Id<"games">, number>> {
  const rows = await ctx.db.query("rulebookRequests").take(5000);
  const counts = new Map<Id<"games">, number>();
  for (const r of rows) counts.set(r.gameId, (counts.get(r.gameId) ?? 0) + 1);
  for (const gameId of [...counts.keys()]) {
    const game = await ctx.db.get("games", gameId);
    const ingested =
      game &&
      (await ctx.db
        .query("rulebooks")
        .withIndex("by_game", (q) => q.eq("gameId", gameId))
        .filter((q) => q.eq(q.field("isIngested"), true))
        .first());
    if (!game || ingested) counts.delete(gameId);
  }
  return counts;
}

/**
 * Record that the caller wants this game's rulebook added + ingested. Deduped per
 * user (one row per game/user), so the admin count reflects unique demand.
 */
export const requestRulebook = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("rulebookRequests")
      .withIndex("by_game_and_user", (q) =>
        q.eq("gameId", gameId).eq("userId", user._id),
      )
      .unique();
    if (existing) return { alreadyRequested: true };
    await ctx.db.insert("rulebookRequests", {
      gameId,
      userId: user._id,
      createdAt: Date.now(),
    });

    // Confirm the request by email — a transactional acknowledgement of an
    // explicit action, so it sends regardless of the product-updates pref (that
    // pref gates the later "it's ready" notification). Best-effort.
    const game = await ctx.db.get("games", gameId);
    if (game && user.email) {
      await ctx.scheduler.runAfter(0, internal.email.sendNotificationEmail, {
        to: user.email,
        recipientName: user.username ?? user.name ?? undefined,
        subject: `We got your rulebook request for ${game.title}`,
        heading: `Your rulebook request is in ✅`,
        body: `Thanks! You asked us to add the rulebook for ${game.title}. We'll ingest it and email you the moment it's ready to chat with.`,
        ctaLabel: `View ${game.title}`,
        ctaUrl: `${SITE_URL}/boardgames/${game.slug}`,
        footerNote:
          "You're receiving this because you requested a rulebook on Meepletron.",
      });
    }
    return { alreadyRequested: false };
  },
});

/**
 * Fulfill every pending request for a game once its rulebook is ingested: email
 * each requester that it's ready, then clear the (now-fulfilled) request rows.
 * Scheduled from `finalizeCommit` on a rulebook's FIRST ingest. Best-effort —
 * a missing email/opt-out just skips the send; the row is cleared either way.
 */
export const fulfillRequests = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get("games", gameId);
    if (!game) return;
    const reqs = await ctx.db
      .query("rulebookRequests")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .take(5000);
    for (const r of reqs) {
      const user = await ctx.db.get("users", r.userId);
      if (user?.email && (user.preferences?.emailUpdates ?? false)) {
        await ctx.scheduler.runAfter(0, internal.email.sendNotificationEmail, {
          to: user.email,
          recipientName: user.username ?? user.name ?? undefined,
          subject: `The rulebook for ${game.title} is ready on Meepletron`,
          heading: `${game.title} is ready to chat 📖`,
          body: `Good news — we've added and processed the rulebook for ${game.title} that you requested. You can now ask the rules assistant anything about it.`,
          ctaLabel: `Ask about ${game.title}`,
          ctaUrl: `${SITE_URL}/boardgames/${game.slug}`,
          footerNote:
            "You're receiving this because you requested this rulebook on Meepletron.",
        });
      }
      await ctx.db.delete("rulebookRequests", r._id);
    }
  },
});

/**
 * Admin: games with pending rulebook requests, most-requested first. A game drops
 * off once it has an ingested rulebook (the request is fulfilled).
 */
export const listRequests = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const counts = await pendingCounts(ctx);
    const items: {
      gameId: Id<"games">;
      slug: string;
      title: string;
      thumbUrl: string | null;
      count: number;
    }[] = [];
    for (const [gameId, count] of counts) {
      const game = await ctx.db.get("games", gameId);
      if (!game) continue;
      items.push({
        gameId,
        slug: game.slug,
        title: game.title,
        thumbUrl: await thumbUrl(ctx, game),
        count,
      });
    }
    items.sort((a, b) => b.count - a.count);
    return items;
  },
});

/** Admin: number of games with pending (unfulfilled) rulebook requests — for the
 *  nav badge. */
export const pendingRequestCount = query({
  args: {},
  handler: async (ctx): Promise<number> => {
    await requireAdmin(ctx);
    return (await pendingCounts(ctx)).size;
  },
});
