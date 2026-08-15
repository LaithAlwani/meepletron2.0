import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// One-off: set `hasExpansions` on base games from existing expansion links.
export const backfillHasExpansions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("games").take(2000);
    const parents = new Set<Id<"games">>();
    for (const g of all) if (g.isExpansion && g.parentId) parents.add(g.parentId);
    let updated = 0;
    for (const g of all) {
      const has = parents.has(g._id);
      if ((g.hasExpansions ?? false) !== has) {
        await ctx.db.patch("games", g._id, { hasExpansions: has });
        updated++;
      }
    }
    return { updated };
  },
});

/**
 * One-off: set `isStub: false` on every existing game.
 *
 * Required before the catalogue can read through `by_isStub_and_isExpansion` —
 * an index lookup on `isStub === false` does not match rows where the field is
 * absent, so without this backfill the library would come back empty.
 */
export const backfillIsStub = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("games").take(5000);
    let updated = 0;
    for (const g of all) {
      if (g.isStub === undefined) {
        await ctx.db.patch("games", g._id, { isStub: false });
        updated++;
      }
    }
    return { scanned: all.length, updated };
  },
});
