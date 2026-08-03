import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, requireUser, requireAdmin } from "./lib/auth";
import { finite } from "./lib/num";

/** Daily token budgets: guests get a smaller allowance to nudge sign-up. */
export const DAILY_TOKEN_LIMIT = 50_000;
export const GUEST_TOKEN_LIMIT = 20_000;

/** The daily token limit for a user, based on whether they're an anonymous guest. */
export function tokenLimitFor(isAnonymous?: boolean): number {
  return isAnonymous ? GUEST_TOKEN_LIMIT : DAILY_TOKEN_LIMIT;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ingestedRulebookIds(
  ctx: QueryCtx,
  gameId: Id<"games">,
): Promise<Id<"rulebooks">[]> {
  const rulebooks = await ctx.db
    .query("rulebooks")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .take(50);
  return rulebooks.filter((r) => r.isIngested).map((r) => r._id);
}

/**
 * Keep only selected rulebooks that still exist, are ingested, and belong to
 * this game. If none survive (e.g. the rulebook was deleted/re-ingested), fall
 * back to all of the game's currently-ingested rulebooks — so a chat never ends
 * up pointing at a stale/empty rulebook and silently losing retrieval.
 */
async function effectiveRulebookIds(
  ctx: QueryCtx,
  gameId: Id<"games">,
  selected: Id<"rulebooks">[],
): Promise<Id<"rulebooks">[]> {
  const valid: Id<"rulebooks">[] = [];
  for (const rid of selected) {
    const rb = await ctx.db.get("rulebooks", rid);
    if (rb && rb.isIngested && rb.gameId === gameId) valid.push(rid);
  }
  if (valid.length > 0) return valid;
  return await ingestedRulebookIds(ctx, gameId);
}

async function loadOwnedChat(
  ctx: QueryCtx,
  chatId: Id<"chats">,
  userId: Id<"users">,
): Promise<Doc<"chats">> {
  const chat = await ctx.db.get("chats", chatId);
  if (!chat || chat.userId !== userId) throw new Error("Chat not found");
  return chat;
}

// ---------------------------------------------------------------------------
// Public queries / mutations
// ---------------------------------------------------------------------------

/** Fetch or create the current user's chat for a game. Returns the chat id. */
export const getOrCreateChat = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<Id<"chats">> => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("chats")
      .withIndex("by_user_and_game", (q) =>
        q.eq("userId", user._id).eq("gameId", gameId),
      )
      .unique();
    if (existing) {
      // Prune stale/deleted rulebook selections (keeps retrieval + the source
      // panel in sync with the game's current rulebooks).
      const effective = await effectiveRulebookIds(
        ctx,
        gameId,
        existing.selectedRulebookIds,
      );
      const changed =
        effective.length !== existing.selectedRulebookIds.length ||
        effective.some((id, i) => id !== existing.selectedRulebookIds[i]);
      if (changed) {
        await ctx.db.patch("chats", existing._id, {
          selectedRulebookIds: effective,
        });
      }
      return existing._id;
    }

    const selectedRulebookIds = await ingestedRulebookIds(ctx, gameId);
    return await ctx.db.insert("chats", {
      userId: user._id,
      gameId,
      selectedRulebookIds,
      lastMessage: "",
      lastMessageAt: Date.now(),
    });
  },
});

export const getChat = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const chat = await ctx.db.get("chats", chatId);
    if (!chat || chat.userId !== user._id) return null;
    return chat;
  },
});

/** Paginated messages, newest-first (client reverses for display + loads older). */
export const messagesPaginated = query({
  args: { chatId: v.id("chats"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { chatId, paginationOpts }) => {
    const user = await getCurrentUser(ctx);
    const empty = { page: [], isDone: true, continueCursor: "" };
    if (!user) return empty;
    const chat = await ctx.db.get("chats", chatId);
    if (!chat || chat.userId !== user._id) return empty;
    return await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .order("desc")
      .paginate(paginationOpts);
  },
});

/** Insert the user's message so it shows immediately, before streaming the reply. */
export const postMessage = mutation({
  args: { chatId: v.id("chats"), content: v.string() },
  handler: async (ctx, { chatId, content }) => {
    const user = await requireUser(ctx);
    await loadOwnedChat(ctx, chatId, user._id);
    const trimmed = content.trim();
    if (!trimmed) throw new Error("Empty message");
    const messageId = await ctx.db.insert("messages", {
      chatId,
      role: "user",
      content: trimmed,
    });
    await ctx.db.patch("chats", chatId, {
      lastMessage: trimmed,
      lastMessageAt: Date.now(),
    });
    return messageId;
  },
});

export const setSelectedRulebooks = mutation({
  args: {
    chatId: v.id("chats"),
    rulebookIds: v.array(v.id("rulebooks")),
  },
  handler: async (ctx, { chatId, rulebookIds }) => {
    const user = await requireUser(ctx);
    await loadOwnedChat(ctx, chatId, user._id);
    await ctx.db.patch("chats", chatId, { selectedRulebookIds: rulebookIds });
  },
});

export const listMyChats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);
    return await Promise.all(
      chats.map(async (chat) => {
        const game = await ctx.db.get("games", chat.gameId);
        const thumbnailUrl =
          game?.thumbnailId ?? game?.imageId
            ? await ctx.storage.getUrl((game.thumbnailId ?? game.imageId)!)
            : null;
        return {
          ...chat,
          gameTitle: game?.title ?? "Unknown game",
          thumbnailUrl,
        };
      }),
    );
  },
});

export const rateMessage = mutation({
  args: {
    messageId: v.id("messages"),
    rating: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, { messageId, rating }) => {
    const user = await requireUser(ctx);
    const message = await ctx.db.get("messages", messageId);
    if (!message) throw new Error("Message not found");
    if (message.role !== "assistant") throw new Error("Only answers can be rated");
    const chat = await ctx.db.get("chats", message.chatId);
    if (!chat || chat.userId !== user._id) throw new Error("Not allowed");
    // Toggle: clicking the active rating clears it.
    await ctx.db.patch("messages", messageId, {
      rating: message.rating === rating ? undefined : rating,
    });
  },
});

/** Admin: a user's chats (with game title + last message). */
export const adminUserChats = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);
    const out = [];
    for (const c of chats) {
      const game = await ctx.db.get("games", c.gameId);
      out.push({
        _id: c._id,
        gameId: c.gameId,
        gameTitle: game?.title ?? "Unknown game",
        lastMessage: c.lastMessage,
        lastMessageAt: c.lastMessageAt,
      });
    }
    return out;
  },
});

/** Admin: the messages in a chat. */
export const adminChatMessages = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .order("asc")
      .take(500);
  },
});

// ---------------------------------------------------------------------------
// Internal functions used by the /chat streaming HTTP action
// ---------------------------------------------------------------------------

/** Context needed to stream a reply: history, query, selected rulebooks, titles. */
export const getStreamContext = internalQuery({
  args: { chatId: v.id("chats"), userId: v.id("users") },
  handler: async (ctx, { chatId, userId }) => {
    const chat = await loadOwnedChat(ctx, chatId, userId);

    // Validate the stored selection against rulebooks that still exist + are
    // ingested for this game. Respect an EXPLICIT empty selection (the user
    // deselected everything) so the caller can ask them to pick a resource —
    // only a non-empty selection that went entirely stale falls back to "all".
    const stored = chat.selectedRulebookIds;
    const valid: Id<"rulebooks">[] = [];
    for (const rid of stored) {
      const rb = await ctx.db.get("rulebooks", rid);
      if (rb && rb.isIngested && rb.gameId === chat.gameId) valid.push(rid);
    }
    const allIngested = await ingestedRulebookIds(ctx, chat.gameId);
    const selectedRulebookIds =
      stored.length === 0 ? [] : valid.length > 0 ? valid : allIngested;
    const hasIngested = allIngested.length > 0;

    const config = await ctx.db.query("siteConfig").order("desc").take(1);
    const historyLimit = config[0]?.historyMessageLimit ?? 6;

    const recent = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .order("desc")
      .take(historyLimit);
    const history = recent.reverse().map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const lastUser = [...recent].find((m) => m.role === "user");
    const query = lastUser?.content ?? "";

    // Source titles for the effective rulebooks (distinct games).
    const gameIds = new Set<Id<"games">>();
    for (const rid of selectedRulebookIds) {
      const rb = await ctx.db.get("rulebooks", rid);
      if (rb) gameIds.add(rb.gameId);
    }
    const sourceTitles: string[] = [];
    for (const gid of gameIds) {
      const g = await ctx.db.get("games", gid);
      if (g) sourceTitles.push(g.title);
    }

    return {
      selectedRulebookIds,
      hasIngested,
      query,
      history,
      sourceTitles,
    };
  },
});

async function titleFor(
  ctx: QueryCtx,
  cache: Map<string, string>,
  gameId: Id<"games">,
): Promise<string> {
  const key = gameId as unknown as string;
  const cached = cache.get(key);
  if (cached) return cached;
  const g = await ctx.db.get("games", gameId);
  const title = g?.title ?? "Unknown game";
  cache.set(key, title);
  return title;
}

/** Hydrate vector-search hits into chunks (with game titles), preserving order. */
export const hydrateChunks = internalQuery({
  args: { chunkIds: v.array(v.id("chunks")) },
  handler: async (ctx, { chunkIds }) => {
    const cache = new Map<string, string>();
    const out = [];
    for (const id of chunkIds) {
      const c = await ctx.db.get("chunks", id);
      if (!c) continue;
      out.push({
        chunkId: c._id,
        gameId: c.gameId,
        rulebookId: c.rulebookId,
        bgTitle: await titleFor(ctx, cache, c.gameId),
        breadcrumb: c.breadcrumb,
        page: c.page,
        chunkType: c.chunkType,
        scope: c.scope,
        variantName: c.variantName,
        text: c.text,
      });
    }
    return out;
  },
});

/** Always-included iconography/legend chunks for the selected rulebooks. */
export const getLegendChunks = internalQuery({
  args: { rulebookIds: v.array(v.id("rulebooks")) },
  handler: async (ctx, { rulebookIds }) => {
    const cache = new Map<string, string>();
    const out = [];
    for (const rid of rulebookIds) {
      const legend = await ctx.db
        .query("chunks")
        .withIndex("by_rulebook_and_type", (q) =>
          q.eq("rulebookId", rid).eq("chunkType", "legend"),
        )
        .take(5);
      for (const c of legend) {
        out.push({
          gameId: c.gameId,
          rulebookId: c.rulebookId,
          bgTitle: await titleFor(ctx, cache, c.gameId),
          breadcrumb: c.breadcrumb,
          page: c.page,
          chunkType: c.chunkType,
          scope: c.scope,
          variantName: c.variantName,
          text: c.text,
        });
      }
    }
    return out;
  },
});

export const getActiveConfig = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("siteConfig").order("desc").take(1);
    // Defaults fill any missing fields (e.g. an older row without newer knobs).
    const defaults = {
      v2TopK: 20,
      v2ScoreThreshold: 0.05,
      rerankTopN: 3,
      historyMessageLimit: 6,
      rerankCandidates: 12,
    };
    return { ...defaults, ...rows[0] };
  },
});

/** Reset the daily budget window if stale; throw if the user is over budget. */
export const reserveBudget = internalMutation({
  args: { userId: v.id("users"), todayStartMs: v.number() },
  handler: async (ctx, { userId, todayStartMs }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) throw new Error("User not found");
    let used = user.tokensUsedToday ?? 0;
    if ((user.tokensResetAt ?? 0) < todayStartMs) {
      used = 0;
      await ctx.db.patch("users", userId, {
        tokensUsedToday: 0,
        tokensResetAt: todayStartMs,
      });
    }
    if (used >= tokenLimitFor(user.isAnonymous)) {
      throw new Error("Daily token limit reached");
    }
  },
});

const annotationValidator = v.object({
  n: v.number(),
  gameId: v.id("games"),
  rulebookId: v.id("rulebooks"),
  bgTitle: v.string(),
  breadcrumb: v.optional(v.string()),
  page: v.optional(v.number()),
  chunkType: v.string(),
  scope: v.string(),
  variantName: v.optional(v.string()),
  text: v.string(),
});

/** Persist the assistant reply + citations, and account for token usage. */
export const saveAssistantMessage = internalMutation({
  args: {
    chatId: v.id("chats"),
    userId: v.id("users"),
    content: v.string(),
    annotations: v.array(annotationValidator),
    usage: v.array(
      v.object({
        purpose: v.union(
          v.literal("chat-answer"),
          v.literal("chat-rerank"),
          v.literal("chat-rewrite"),
          v.literal("chat-embed"),
        ),
        model: v.string(),
        promptTokens: v.number(),
        completionTokens: v.number(),
        totalTokens: v.number(),
      }),
    ),
  },
  handler: async (ctx, { chatId, userId, content, annotations, usage }) => {
    await ctx.db.insert("messages", {
      chatId,
      role: "assistant",
      content,
      annotations: annotations.length > 0 ? annotations : undefined,
    });
    await ctx.db.patch("chats", chatId, {
      lastMessage: content.slice(0, 200),
      lastMessageAt: Date.now(),
    });

    let total = 0;
    for (const u of usage) {
      const promptTokens = finite(u.promptTokens);
      const completionTokens = finite(u.completionTokens);
      const totalTokens = finite(u.totalTokens);
      await ctx.db.insert("usageLog", {
        purpose: u.purpose,
        model: u.model,
        promptTokens,
        completionTokens,
        totalTokens,
      });
      total += totalTokens;
    }

    const user = await ctx.db.get("users", userId);
    if (user) {
      await ctx.db.patch("users", userId, {
        tokensUsedToday: finite(user.tokensUsedToday) + total,
      });
    }
  },
});
