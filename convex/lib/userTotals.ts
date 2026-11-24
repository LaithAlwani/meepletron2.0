import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

/** A user's running-totals doc (see schema `userTotals`), or null. */
export async function userTotalsDoc(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("userTotals")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/**
 * Add an assistant message's tokens to the user's all-time total. Call in the
 * same mutation that inserts the message (chat.saveAssistantMessage). When the
 * user has no `userTotals` doc yet, schedules a one-off seed from a scan instead
 * (users.seedUserTotals) — it runs after this commits, so it counts this message.
 */
export async function bumpUserTokens(
  ctx: MutationCtx,
  userId: Id<"users">,
  tokens: number,
): Promise<void> {
  const doc = await userTotalsDoc(ctx, userId);
  if (doc) {
    if (tokens > 0) {
      await ctx.db.patch("userTotals", doc._id, {
        tokensUsedTotal: doc.tokensUsedTotal + tokens,
      });
    }
    return;
  }
  await ctx.scheduler.runAfter(0, internal.users.seedUserTotals, { userId });
}
