import { v, ConvexError } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getCurrentUser, requireUser, requireAdmin } from "./lib/auth";
import { tokenLimitFor } from "./chat";
import { finite } from "./lib/num";
import { deleteUserAppData, deleteUserAndAuth } from "./lib/purge";

/** The current user's profile (null when signed out). Reactive. `avatarUrl`
 *  resolves the uploaded avatar, falling back to the OAuth `image`. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const avatarUrl = user.avatarStorageId
      ? await ctx.storage.getUrl(user.avatarStorageId)
      : (user.image ?? null);
    const recentAvatars = (
      await Promise.all(
        (user.avatarHistory ?? []).map(async (storageId) => ({
          storageId,
          url: await ctx.storage.getUrl(storageId),
        })),
      )
    ).filter((r): r is { storageId: typeof r.storageId; url: string } =>
      r.url !== null,
    );
    return { ...user, avatarUrl, recentAvatars };
  },
});

/**
 * The current user's daily token budget. `tokensUsedToday` is authoritative
 * because the nightly cron zeroes it at UTC midnight, so we can report what's
 * left without reading wall-clock in a (reactive, cacheable) query.
 */
export const myBudget = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const isGuest = user.isAnonymous === true;
    const limit = tokenLimitFor(user.isAnonymous);
    const used = Math.min(finite(user.tokensUsedToday), limit);
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      isGuest,
    };
  },
});

/** The current user's activity stats for the profile page. */
export const myStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(500);
    let userMessages = 0;
    let aiMessages = 0;
    let correctRatings = 0;
    let wrongRatings = 0;
    for (const c of chats) {
      const msgs = await ctx.db
        .query("messages")
        .withIndex("by_chat", (q) => q.eq("chatId", c._id))
        .take(1000);
      for (const m of msgs) {
        if (m.role === "user") userMessages++;
        else {
          aiMessages++;
          if (m.rating === "up") correctRatings++;
          else if (m.rating === "down") wrongRatings++;
        }
      }
    }
    return {
      totalChats: chats.length,
      userMessages,
      aiMessages,
      correctRatings,
      wrongRatings,
    };
  },
});

/** Update the current user's display name. */
export const updateProfile = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = await requireUser(ctx);
    await ctx.db.patch("users", user._id, { name: name.trim() || undefined });
  },
});

/**
 * Find members by name or @username, for tagging players in a play log. Only
 * users with a public username are discoverable; guests are excluded. Bounded
 * scan (the caller must be signed in). Returns minimal public fields.
 */
export const searchUsers = query({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    const me = await getCurrentUser(ctx);
    if (!me) return [];
    const t = term.trim().toLowerCase();
    if (t.length < 2) return [];
    const rows = await ctx.db.query("users").take(1000);
    const matched = rows
      .filter((u) => {
        if (u._id === me._id || u.isAnonymous === true || !u.username) return false;
        const byUsername = u.usernameLower?.includes(t) ?? false;
        // Real name only matches for users who opted into being findable by name.
        const findable = u.publicProfile?.findableByName ?? false;
        const byName = findable && (u.name?.toLowerCase().includes(t) ?? false);
        return byUsername || byName;
      })
      .slice(0, 8);
    return await Promise.all(
      matched.map(async (u) => {
        // Show the real name in results only for users findable by name;
        // otherwise the public username stands in for it.
        const findable = u.publicProfile?.findableByName ?? false;
        return {
          _id: u._id,
          name: (findable ? u.name : null) ?? u.username ?? "Player",
          username: u.username ?? null,
          avatarUrl: u.avatarStorageId
            ? await ctx.storage.getUrl(u.avatarStorageId)
            : (u.image ?? null),
        };
      }),
    );
  },
});

/**
 * Update which parts of the profile are exposed on the public /user/<username>
 * page. Merges the given toggles into the existing set (all optional).
 */
export const setPublicProfile = mutation({
  args: {
    isPublic: v.optional(v.boolean()),
    showName: v.optional(v.boolean()),
    findableByName: v.optional(v.boolean()),
    showAvatar: v.optional(v.boolean()),
    showTopLists: v.optional(v.boolean()),
    showOwned: v.optional(v.boolean()),
    showForTrade: v.optional(v.boolean()),
    showWishlist: v.optional(v.boolean()),
    showPlays: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await ctx.db.patch("users", user._id, {
      publicProfile: { ...(user.publicProfile ?? {}), ...args },
    });
  },
});

/** A short-lived URL the client POSTs the avatar file to. */
export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Set the avatar from a freshly-uploaded (already client-compressed) image.
 * Pushes it onto the recents history, keeping the last 5 and deleting whatever
 * a 6th upload evicts.
 */
export const setAvatar = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const user = await requireUser(ctx);
    const meta = await ctx.db.system.get("_storage", storageId);
    if (!meta || !(meta.contentType ?? "").startsWith("image/")) {
      await ctx.storage.delete(storageId);
      throw new ConvexError("That file isn't an image.");
    }
    const prev = user.avatarHistory ?? [];
    const merged = [storageId, ...prev.filter((id) => id !== storageId)];
    const history = merged.slice(0, 5);
    for (const evicted of merged.slice(5)) await ctx.storage.delete(evicted);
    await ctx.db.patch("users", user._id, {
      avatarStorageId: storageId,
      avatarHistory: history,
    });
  },
});

/** Reuse one of the recent avatars (must be in the history). */
export const useRecentAvatar = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const user = await requireUser(ctx);
    const history = user.avatarHistory ?? [];
    if (!history.includes(storageId)) {
      throw new ConvexError("That photo isn't in your recents.");
    }
    await ctx.db.patch("users", user._id, {
      avatarStorageId: storageId,
      avatarHistory: [storageId, ...history.filter((id) => id !== storageId)],
    });
  },
});

/** Clear the current avatar (keeps recents so it can be re-picked). */
export const removeAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await ctx.db.patch("users", user._id, { avatarStorageId: undefined });
  },
});

/** Set (or clear) the current user's username — unique, 3–20 chars. */
export const setUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const user = await requireUser(ctx);
    const trimmed = username.trim();
    if (!trimmed) {
      await ctx.db.patch("users", user._id, {
        username: undefined,
        usernameLower: undefined,
      });
      return;
    }
    if (!/^[a-zA-Z0-9_.]{3,20}$/.test(trimmed)) {
      throw new ConvexError(
        "Usernames are 3–20 characters: letters, numbers, underscore or dot.",
      );
    }
    const lower = trimmed.toLowerCase();
    const clash = await ctx.db
      .query("users")
      .withIndex("by_username_lower", (q) => q.eq("usernameLower", lower))
      .unique();
    if (clash && clash._id !== user._id) {
      throw new ConvexError("That username is taken.");
    }
    await ctx.db.patch("users", user._id, {
      username: trimmed,
      usernameLower: lower,
    });
  },
});

/** Save the current user's preferences (the Settings page sends the full set). */
export const updateSettings = mutation({
  args: {
    preferences: v.object({
      fontSize: v.optional(
        v.union(
          v.literal("sm"),
          v.literal("base"),
          v.literal("lg"),
          v.literal("xl"),
        ),
      ),
      reduceMotion: v.optional(v.boolean()),
      compact: v.optional(v.boolean()),
      enterToSend: v.optional(v.boolean()),
      showSources: v.optional(v.boolean()),
      emailUpdates: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { preferences }) => {
    const user = await requireUser(ctx);
    await ctx.db.patch("users", user._id, {
      preferences: { ...(user.preferences ?? {}), ...preferences },
    });
  },
});

/**
 * Permanently delete the caller's own account: their app data (chats,
 * messages, favorites) and their auth rows + user row. Reuses the same purge
 * helpers the guest-cleanup cron uses. Admins are blocked here to avoid
 * accidental lockout — demote first (or use the CLI) to delete an admin.
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.role === "admin") {
      throw new Error("Admins can't delete their own account here.");
    }
    await deleteUserAppData(ctx, user._id);
    await deleteUserAndAuth(ctx, user._id);
  },
});

/** List users for the admin console. */
export const adminListUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").order("desc").take(500);
    return users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role ?? "user",
      isAnonymous: u.isAnonymous ?? false,
      tokensUsedToday: finite(u.tokensUsedToday),
    }));
  },
});

/** A single user's profile (admin). */
export const adminGetUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const u = await ctx.db.get("users", userId);
    if (!u) return null;
    return {
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role ?? "user",
      isAnonymous: u.isAnonymous ?? false,
      tokensUsedToday: finite(u.tokensUsedToday),
    };
  },
});

/** Set a user's role (admin). Guards against removing your own admin access. */
export const setUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("admin")),
  },
  handler: async (ctx, { userId, role }) => {
    const me = await requireAdmin(ctx);
    if (me._id === userId && role !== "admin") {
      throw new Error("You can't remove your own admin access");
    }
    await ctx.db.patch("users", userId, { role });
  },
});

/** Throw unless the caller is an admin. For use from actions via runQuery. */
export const ensureAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user || user.role !== "admin") throw new Error("Unauthorized");
  },
});

/**
 * Promote a user to admin by email. Internal — run from the CLI/dashboard:
 * `npx convex run users:makeAdmin '{"email":"you@example.com"}'`
 */
export const makeAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (!user) throw new Error(`No user with email ${email}`);
    await ctx.db.patch("users", user._id, { role: "admin" });
    return user._id;
  },
});

/**
 * When a **verified** account's email matches a reserved imported row (see
 * convex/migrations.ts importOldUsers), adopt that row's identity onto the
 * account and delete the reserved row. Scheduled from `afterUserCreatedOrUpdated`
 * so it runs with the app's typed db (the auth callback's ctx.db is generic).
 * Idempotent + a no-op once no reserved twin remains.
 */
export const adoptReservedRow = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    if (!user?.email || user.emailVerificationTime === undefined) return;
    const reserved = (
      await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", user.email))
        .collect()
    ).find((o) => o._id !== userId && o.importedAt !== undefined);
    if (!reserved) return;
    await ctx.db.patch("users", userId, {
      username: user.username ?? reserved.username,
      usernameLower: user.usernameLower ?? reserved.usernameLower,
      name: user.name ?? reserved.name,
      publicProfile: user.publicProfile ?? reserved.publicProfile,
      createdAt: reserved.createdAt,
      updatedAt: reserved.updatedAt,
    });
    await ctx.db.delete("users", reserved._id);
    await ctx.scheduler.runAfter(0, internal.plays.claimPlaysByEmail, {
      userId,
      email: user.email,
    });
  },
});
