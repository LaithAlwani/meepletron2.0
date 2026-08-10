import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/** True if this specific game/expansion has ≥1 ingested (chattable) rulebook. */
async function hasIngestedRulebook(
  ctx: MutationCtx,
  gameId: Id<"games">,
): Promise<boolean> {
  const rbs = await ctx.db
    .query("rulebooks")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .take(50);
  return rbs.some((r) => r.isIngested);
}

/**
 * Recompute a base game's `chatReady` flag: true iff the family (the base game
 * plus its expansions) has any ingested rulebook — i.e. a user can actually
 * chat with it. Call after any ingest / un-ingest / rulebook-or-game deletion.
 * Accepts a base game or expansion id (resolves to the base). No-op if unchanged.
 */
export async function recomputeChatReady(
  ctx: MutationCtx,
  gameId: Id<"games">,
): Promise<void> {
  const game = await ctx.db.get("games", gameId);
  if (!game) return;
  const baseId =
    game.isExpansion && game.parentId ? game.parentId : game._id;
  const base = game._id === baseId ? game : await ctx.db.get("games", baseId);
  if (!base) return;

  const expansions = await ctx.db
    .query("games")
    .withIndex("by_parent", (q) => q.eq("parentId", baseId))
    .take(100);

  let ready = false;
  for (const gid of [baseId, ...expansions.map((e) => e._id)]) {
    if (await hasIngestedRulebook(ctx, gid)) {
      ready = true;
      break;
    }
  }
  if ((base.chatReady ?? false) !== ready) {
    await ctx.db.patch("games", baseId, { chatReady: ready });
  }
}
