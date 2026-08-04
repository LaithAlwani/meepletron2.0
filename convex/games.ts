import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./lib/auth";
import { slugify } from "./lib/slug";
import { buildSearchText } from "./lib/gameSearch";

/** Resolve a game's storage ids into signed URLs for the client. */
async function withMedia(ctx: QueryCtx, game: Doc<"games">) {
  const [imageUrl, thumbnailUrl] = await Promise.all([
    game.imageId ? ctx.storage.getUrl(game.imageId) : Promise.resolve(null),
    game.thumbnailId
      ? ctx.storage.getUrl(game.thumbnailId)
      : Promise.resolve(null),
  ]);
  return { ...game, imageUrl, thumbnailUrl };
}

export type GameWithMedia = Awaited<ReturnType<typeof withMedia>>;

/** A rulebook enriched with a normalized `kind` and a signed download URL. */
async function rulebookWithMeta(ctx: QueryCtx, rb: Doc<"rulebooks">) {
  return {
    ...rb,
    kind: rb.kind ?? ("rulebook" as const),
    downloadUrl: await ctx.storage.getUrl(rb.storageId),
  };
}

export type RulebookWithMeta = Awaited<ReturnType<typeof rulebookWithMeta>>;

/** Base games (not expansions) for the library grid. Reactive. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db
      .query("games")
      .withIndex("by_isExpansion", (q) => q.eq("isExpansion", false))
      .take(200);
    return await Promise.all(games.map((g) => withMedia(ctx, g)));
  },
});

/** Paginated base-game library. */
export const listPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query("games")
      .withIndex("by_isExpansion", (q) => q.eq("isExpansion", false))
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(result.page.map((g) => withMedia(ctx, g))),
    };
  },
});

/** Paginated fuzzy search across title, designers, publishers, categories, mechanics. */
export const searchPaginated = query({
  args: { term: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { term, paginationOpts }) => {
    const trimmed = term.trim();
    if (!trimmed) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const result = await ctx.db
      .query("games")
      .withSearchIndex("search_text", (q) =>
        q.search("searchText", trimmed).eq("isExpansion", false),
      )
      .paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(result.page.map((g) => withMedia(ctx, g))),
    };
  },
});

/** Paginated base-game library with optional filters (players / time / expansions). */
export const browsePaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    players: v.optional(v.number()),
    time: v.optional(
      v.union(v.literal("quick"), v.literal("standard"), v.literal("epic")),
    ),
    hasExpansions: v.optional(v.boolean()),
  },
  handler: async (ctx, { paginationOpts, players, time, hasExpansions }) => {
    const base = ctx.db
      .query("games")
      .withIndex("by_isExpansion", (q) => q.eq("isExpansion", false))
      .order("desc");

    const needsFilter = players != null || time != null || hasExpansions;
    const q = needsFilter
      ? base.filter((fq) => {
          const conds = [];
          if (players != null) {
            conds.push(
              fq.and(
                fq.lte(fq.field("minPlayers"), players),
                fq.gte(fq.field("maxPlayers"), players),
              ),
            );
          }
          if (time === "quick") conds.push(fq.lte(fq.field("maxPlayTime"), 30));
          else if (time === "standard")
            conds.push(
              fq.and(
                fq.gt(fq.field("maxPlayTime"), 30),
                fq.lte(fq.field("maxPlayTime"), 90),
              ),
            );
          else if (time === "epic")
            conds.push(fq.gt(fq.field("maxPlayTime"), 90));
          if (hasExpansions)
            conds.push(fq.eq(fq.field("hasExpansions"), true));
          return fq.and(...conds);
        })
      : base;

    const result = await q.paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(result.page.map((g) => withMedia(ctx, g))),
    };
  },
});

/**
 * Exact count of base games matching the library filters — for the "Board
 * games (N)" header. Scans only base games (~a few hundred), no media.
 * Keep the filter logic in sync with `browsePaginated`.
 */
export const browseCount = query({
  args: {
    players: v.optional(v.number()),
    time: v.optional(
      v.union(v.literal("quick"), v.literal("standard"), v.literal("epic")),
    ),
    hasExpansions: v.optional(v.boolean()),
  },
  handler: async (ctx, { players, time, hasExpansions }) => {
    const base = ctx.db
      .query("games")
      .withIndex("by_isExpansion", (q) => q.eq("isExpansion", false));

    const needsFilter = players != null || time != null || hasExpansions;
    const q = needsFilter
      ? base.filter((fq) => {
          const conds = [];
          if (players != null) {
            conds.push(
              fq.and(
                fq.lte(fq.field("minPlayers"), players),
                fq.gte(fq.field("maxPlayers"), players),
              ),
            );
          }
          if (time === "quick") conds.push(fq.lte(fq.field("maxPlayTime"), 30));
          else if (time === "standard")
            conds.push(
              fq.and(
                fq.gt(fq.field("maxPlayTime"), 30),
                fq.lte(fq.field("maxPlayTime"), 90),
              ),
            );
          else if (time === "epic")
            conds.push(fq.gt(fq.field("maxPlayTime"), 90));
          if (hasExpansions)
            conds.push(fq.eq(fq.field("hasExpansions"), true));
          return fq.and(...conds);
        })
      : base;

    const rows = await q.collect();
    return rows.length;
  },
});

/** Assemble a game detail: the game (with media), parent, expansions, rulebooks. */
async function gameDetail(ctx: QueryCtx, game: Doc<"games">) {
  const [expansions, rulebookDocs, parentDoc] = await Promise.all([
    ctx.db
      .query("games")
      .withIndex("by_parent", (q) => q.eq("parentId", game._id))
      .take(100),
    ctx.db
      .query("rulebooks")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .take(50),
    game.parentId
      ? ctx.db.get("games", game.parentId)
      : Promise.resolve(null),
  ]);
  return {
    ...(await withMedia(ctx, game)),
    // For expansions, the base game they belong to (null for base games).
    parent: parentDoc ? await withMedia(ctx, parentDoc) : null,
    expansions: await Promise.all(expansions.map((e) => withMedia(ctx, e))),
    rulebooks: await Promise.all(
      rulebookDocs.map((rb) => rulebookWithMeta(ctx, rb)),
    ),
  };
}

/** A game detail by id. */
export const getById = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get("games", gameId);
    return game ? await gameDetail(ctx, game) : null;
  },
});

/**
 * A game detail by slug (SEO-friendly URLs), falling back to id so old
 * `/boardgames/<id>` links keep resolving.
 */
export const getByHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    let game = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", handle))
      .first();
    if (!game) {
      const asId = ctx.db.normalizeId("games", handle);
      if (asId) game = await ctx.db.get("games", asId);
    }
    return game ? await gameDetail(ctx, game) : null;
  },
});

/**
 * Chat sources for a game family, grouped by game (base first, then expansions
 * that have ingested rulebooks). Only ingested rulebooks — the ones the chat can
 * actually retrieve from. `gameId` is resolved to its base game.
 */
export const chatSources = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get("games", gameId);
    if (!game) return [];
    const baseId =
      game.isExpansion && game.parentId ? game.parentId : game._id;
    const base = baseId === game._id ? game : await ctx.db.get("games", baseId);
    if (!base) return [];

    const expansions = await ctx.db
      .query("games")
      .withIndex("by_parent", (q) => q.eq("parentId", baseId))
      .take(100);

    const groupFor = async (g: Doc<"games">, isBase: boolean) => {
      const rbs = await ctx.db
        .query("rulebooks")
        .withIndex("by_game", (q) => q.eq("gameId", g._id))
        .take(50);
      return {
        gameId: g._id,
        gameTitle: g.title,
        isBase,
        rulebooks: rbs
          .filter((r) => r.isIngested)
          .map((r) => ({ _id: r._id, label: r.label })),
      };
    };

    const groups = [await groupFor(base, true)];
    for (const exp of expansions) {
      const grp = await groupFor(exp, false);
      if (grp.rulebooks.length > 0) groups.push(grp);
    }
    return groups;
  },
});

// ---------------------------------------------------------------------------
// Admin CRUD
// ---------------------------------------------------------------------------

/** All games (base + expansions), for the admin list. */
/**
 * Lightweight list of every game for the admin index — just the fields the
 * list row + search + ingest filters need (no heavy metadata/searchText). The
 * page renders/searches/filters/pages this client-side.
 */
export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const games = await ctx.db.query("games").order("desc").take(1000);
    return await Promise.all(
      games.map(async (g) => {
        const rulebooks = await ctx.db
          .query("rulebooks")
          .withIndex("by_game", (q) => q.eq("gameId", g._id))
          // Only chat rulebooks are ingestable; "download" add-ons are not.
          .collect();
        const files = rulebooks.filter((r) => (r.kind ?? "rulebook") !== "download");
        const ingested = files.filter((r) => r.isIngested).length;
        return {
          _id: g._id,
          title: g.title,
          slug: g.slug,
          isExpansion: g.isExpansion,
          thumbnailUrl: g.thumbnailId
            ? await ctx.storage.getUrl(g.thumbnailId)
            : null,
          fileCount: files.length,
          ingestedCount: ingested,
        };
      }),
    );
  },
});

const metadataFields = {
  year: v.optional(v.string()),
  minPlayers: v.optional(v.number()),
  maxPlayers: v.optional(v.number()),
  minAge: v.optional(v.string()),
  minPlayTime: v.optional(v.number()),
  maxPlayTime: v.optional(v.number()),
  description: v.optional(v.string()),
  designers: v.optional(v.array(v.string())),
  artists: v.optional(v.array(v.string())),
  publishers: v.optional(v.array(v.string())),
  categories: v.optional(v.array(v.string())),
  gameMechanics: v.optional(v.array(v.string())),
};

export const createGame = mutation({
  args: {
    title: v.string(),
    isExpansion: v.boolean(),
    parentId: v.optional(v.id("games")),
    ...metadataFields,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const title = args.title.trim();
    if (!title) throw new Error("Title is required");
    // Mark the parent as having expansions.
    if (args.isExpansion && args.parentId) {
      await ctx.db.patch("games", args.parentId, { hasExpansions: true });
    }
    return await ctx.db.insert("games", {
      title,
      slug: slugify(title),
      isExpansion: args.isExpansion,
      parentId: args.parentId,
      year: args.year,
      minPlayers: args.minPlayers,
      maxPlayers: args.maxPlayers,
      minAge: args.minAge,
      minPlayTime: args.minPlayTime,
      maxPlayTime: args.maxPlayTime,
      description: args.description,
      designers: args.designers ?? [],
      artists: args.artists ?? [],
      publishers: args.publishers ?? [],
      categories: args.categories ?? [],
      gameMechanics: args.gameMechanics ?? [],
      searchText: buildSearchText({
        title,
        designers: args.designers,
        publishers: args.publishers,
        categories: args.categories,
        gameMechanics: args.gameMechanics,
      }),
    });
  },
});

export const updateGame = mutation({
  args: {
    gameId: v.id("games"),
    title: v.optional(v.string()),
    isExpansion: v.optional(v.boolean()),
    parentId: v.optional(v.id("games")),
    ...metadataFields,
  },
  handler: async (ctx, { gameId, ...rest }) => {
    await requireAdmin(ctx);
    const game = await ctx.db.get("games", gameId);
    if (!game) throw new Error("Game not found");
    const patch: Record<string, unknown> = { ...rest };
    if (rest.title !== undefined) {
      const title = rest.title.trim();
      if (!title) throw new Error("Title cannot be empty");
      patch.title = title;
      patch.slug = slugify(title);
    }
    patch.searchText = buildSearchText({
      title: (patch.title as string | undefined) ?? game.title,
      designers: rest.designers ?? game.designers,
      publishers: rest.publishers ?? game.publishers,
      categories: rest.categories ?? game.categories,
      gameMechanics: rest.gameMechanics ?? game.gameMechanics,
    });
    await ctx.db.patch("games", gameId, patch);
  },
});

/** Attach an uploaded image as the game's cover (validates content type). */
export const setGameImage = mutation({
  args: {
    gameId: v.id("games"),
    storageId: v.id("_storage"),
    // Optional smaller crop for grids/lists; falls back to the cover.
    thumbnailId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { gameId, storageId, thumbnailId }) => {
    await requireAdmin(ctx);
    const meta = await ctx.db.system.get("_storage", storageId);
    if (!meta || !(meta.contentType ?? "").startsWith("image/")) {
      throw new Error("Cover must be an image file");
    }
    const game = await ctx.db.get("games", gameId);
    if (!game) throw new Error("Game not found");

    const newThumb = thumbnailId ?? storageId;
    // Free the previous cover + thumbnail blobs, but never the ones we're about
    // to reference (cover and thumb can legitimately be the same storageId).
    const stale = new Set<Id<"_storage">>();
    if (game.imageId) stale.add(game.imageId);
    if (game.thumbnailId) stale.add(game.thumbnailId);
    stale.delete(storageId);
    stale.delete(newThumb);
    for (const id of stale) await ctx.storage.delete(id);

    await ctx.db.patch("games", gameId, {
      imageId: storageId,
      thumbnailId: newThumb,
    });
  },
});

/** Delete a game and everything under it (rulebooks, chunks, chats, messages). */
export const deleteGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    await requireAdmin(ctx);
    const game = await ctx.db.get("games", gameId);
    if (!game) return;

    // Rulebooks + their chunks + their storage + drafts.
    const rulebooks = await ctx.db
      .query("rulebooks")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .take(100);
    for (const rb of rulebooks) {
      const chunks = await ctx.db
        .query("chunks")
        .withIndex("by_rulebook", (q) => q.eq("rulebookId", rb._id))
        .take(1000);
      for (const c of chunks) await ctx.db.delete("chunks", c._id);
      await ctx.storage.delete(rb.storageId);
      await ctx.db.delete("rulebooks", rb._id);
    }

    // Chats + messages for this game (admin op — a filtered scan is acceptable).
    const chats = await ctx.db
      .query("chats")
      .filter((q) => q.eq(q.field("gameId"), gameId))
      .take(500);
    for (const chat of chats) {
      const msgs = await ctx.db
        .query("messages")
        .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
        .take(1000);
      for (const m of msgs) await ctx.db.delete("messages", m._id);
      await ctx.db.delete("chats", chat._id);
    }

    // Free cover + thumbnail blobs (dedupe — they may be the same storageId).
    const blobs = new Set<Id<"_storage">>();
    if (game.imageId) blobs.add(game.imageId);
    if (game.thumbnailId) blobs.add(game.thumbnailId);
    for (const id of blobs) await ctx.storage.delete(id);
    await ctx.db.delete("games", gameId);

    // If this was an expansion, recompute its parent's hasExpansions flag.
    if (game.isExpansion && game.parentId) {
      const sibling = await ctx.db
        .query("games")
        .withIndex("by_parent", (q) => q.eq("parentId", game.parentId))
        .first();
      await ctx.db.patch("games", game.parentId, {
        hasExpansions: sibling !== null,
      });
    }
  },
});
