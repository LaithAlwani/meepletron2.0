import { internalMutation } from "./_generated/server";
import { slugify } from "./lib/slug";
import { buildSearchText } from "./lib/gameSearch";

/** Seed the singleton RAG-config row (idempotent). */
export const seedSiteConfig = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("siteConfig").take(1);
    if (existing.length > 0) return existing[0]._id;
    return await ctx.db.insert("siteConfig", {
      v2TopK: 10,
      v2ScoreThreshold: 0.05,
      rerankTopN: 3,
      historyMessageLimit: 6,
    });
  },
});

/** Seed a sample base game so the library isn't empty (idempotent by slug). */
export const seedSampleGame = internalMutation({
  args: {},
  handler: async (ctx) => {
    const slug = slugify("Catan");
    const existing = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("games", {
      title: "Catan",
      slug,
      isExpansion: false,
      year: "1995",
      minPlayers: 3,
      maxPlayers: 4,
      minAge: "10",
      minPlayTime: 60,
      maxPlayTime: 90,
      description:
        "Trade, build, and settle the island of Catan in this classic game of resource management and negotiation.",
      designers: ["Klaus Teuber"],
      artists: [],
      publishers: ["Kosmos"],
      categories: ["Economic", "Negotiation"],
      gameMechanics: ["Dice Rolling", "Trading", "Route Building"],
      searchText: buildSearchText({
        title: "Catan",
        designers: ["Klaus Teuber"],
        publishers: ["Kosmos"],
        categories: ["Economic", "Negotiation"],
        gameMechanics: ["Dice Rolling", "Trading", "Route Building"],
      }),
    });
  },
});
