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
