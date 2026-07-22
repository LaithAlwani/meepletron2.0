import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { slugify } from "./lib/slug";
import { embedDocuments } from "./lib/embedding";
import { buildSearchText } from "./lib/gameSearch";

type SeedChunk = {
  breadcrumb: string;
  page: number;
  chunkType: "text" | "table" | "list" | "legend";
  scope: "main" | "variant";
  text: string;
};

// A handful of hand-written Catan rules to prove retrieval end-to-end.
const CATAN_CHUNKS: SeedChunk[] = [
  {
    breadcrumb: "Setup",
    page: 2,
    chunkType: "text",
    scope: "main",
    text: "During setup each player places 2 settlements and 2 roads on the board. Place your first settlement and an adjacent road, then, in reverse player order, place your second settlement and road. You collect one resource card for each terrain hex touching your second settlement.",
  },
  {
    breadcrumb: "Gameplay > Resource Production",
    page: 3,
    chunkType: "text",
    scope: "main",
    text: "On your turn you must roll both dice. The number rolled indicates which terrain hexes produce resources this turn: every player with a settlement adjacent to a hex bearing that number receives 1 resource of that hex's type, and 2 resources for a city.",
  },
  {
    breadcrumb: "Building > Costs",
    page: 4,
    chunkType: "table",
    scope: "main",
    text: "Building costs: Road = 1 brick + 1 lumber. Settlement = 1 brick + 1 lumber + 1 wool + 1 grain. City (upgrades a settlement) = 3 ore + 2 grain. Development card = 1 ore + 1 wool + 1 grain.",
  },
  {
    breadcrumb: "Gameplay > The Robber",
    page: 5,
    chunkType: "text",
    scope: "main",
    text: "When a 7 is rolled, every player holding more than 7 resource cards must discard half of them (rounded down). The player who rolled then moves the robber to any hex, blocking its production, and steals 1 random resource card from a player with a settlement or city on that hex.",
  },
  {
    breadcrumb: "Trading",
    page: 5,
    chunkType: "text",
    scope: "main",
    text: "On your turn you may trade resources with other players in any amounts you both agree to. You may also trade with the bank at 4:1 (four identical resources for any one), or use a harbor for 3:1, or a special 2:1 harbor for its specific resource.",
  },
  {
    breadcrumb: "Special Cards > Longest Road",
    page: 6,
    chunkType: "text",
    scope: "main",
    text: "The first player to build a continuous road of at least 5 segments takes the Longest Road card, worth 2 victory points. If another player later builds a strictly longer continuous road, they take the card.",
  },
  {
    breadcrumb: "Special Cards > Largest Army",
    page: 6,
    chunkType: "text",
    scope: "main",
    text: "The first player to play 3 Knight development cards takes the Largest Army card, worth 2 victory points. It passes to any player who later has played more Knights than the current holder.",
  },
  {
    breadcrumb: "Winning the Game",
    page: 7,
    chunkType: "text",
    scope: "main",
    text: "The first player to reach 10 victory points on their turn immediately wins the game. Victory points come from settlements (1 each), cities (2 each), Longest Road (2), Largest Army (2), and Victory Point development cards (1 each).",
  },
];

/** Ensure the Catan sample game exists; return its id. */
export const ensureCatanGame = internalMutation({
  args: {},
  handler: async (ctx): Promise<Id<"games">> => {
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

/** Ensure a "Base Rules" rulebook row exists for a game; return its id. */
export const ensureRulebook = internalMutation({
  args: { gameId: v.id("games"), storageId: v.id("_storage") },
  handler: async (ctx, { gameId, storageId }): Promise<Id<"rulebooks">> => {
    const existing = await ctx.db
      .query("rulebooks")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("rulebooks", {
      gameId,
      label: "Base Rules",
      filename: "catan-base-rules.txt",
      storageId,
      isIngested: false,
      ingestState: "none",
    });
  },
});

/** Replace a rulebook's chunks with the provided embedded chunks; mark ingested. */
export const insertChunks = internalMutation({
  args: {
    rulebookId: v.id("rulebooks"),
    gameId: v.id("games"),
    chunks: v.array(
      v.object({
        breadcrumb: v.string(),
        page: v.number(),
        chunkType: v.union(
          v.literal("text"),
          v.literal("table"),
          v.literal("list"),
          v.literal("legend"),
        ),
        scope: v.union(v.literal("main"), v.literal("variant")),
        text: v.string(),
        embedding: v.array(v.float64()),
      }),
    ),
  },
  handler: async (ctx, { rulebookId, gameId, chunks }) => {
    // Clear existing chunks for this rulebook (idempotent re-seed).
    const existing = await ctx.db
      .query("chunks")
      .withIndex("by_rulebook", (q) => q.eq("rulebookId", rulebookId))
      .take(500);
    for (const c of existing) await ctx.db.delete("chunks", c._id);

    for (const c of chunks) {
      await ctx.db.insert("chunks", {
        rulebookId,
        gameId,
        breadcrumb: c.breadcrumb,
        page: c.page,
        chunkType: c.chunkType,
        scope: c.scope,
        text: c.text,
        embedding: c.embedding,
      });
    }
    await ctx.db.patch("rulebooks", rulebookId, {
      isIngested: true,
      ingestState: "committed",
    });
  },
});

/** One-shot: seed Catan with an ingested "Base Rules" rulebook + embedded chunks. */
export const seedCatanRag = internalAction({
  args: {},
  handler: async (ctx): Promise<{ rulebookId: Id<"rulebooks">; chunks: number }> => {
    const gameId = await ctx.runMutation(internal.seedRag.ensureCatanGame, {});
    const storageId = await ctx.storage.store(
      new Blob(["Catan base rules (seed placeholder)."], { type: "text/plain" }),
    );
    const rulebookId = await ctx.runMutation(internal.seedRag.ensureRulebook, {
      gameId,
      storageId,
    });

    const { embeddings } = await embedDocuments(
      CATAN_CHUNKS.map((c) => c.text),
    );

    await ctx.runMutation(internal.seedRag.insertChunks, {
      rulebookId,
      gameId,
      chunks: CATAN_CHUNKS.map((c, i) => ({ ...c, embedding: embeddings[i] })),
    });

    return { rulebookId, chunks: CATAN_CHUNKS.length };
  },
});
