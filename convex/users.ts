import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { getCurrentUser, requireUser, requireAdmin } from "./lib/auth";
import { DAILY_TOKEN_LIMIT } from "./chat";
import { finite } from "./lib/num";

/** The current user's profile (null when signed out). Reactive. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
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
    const used = Math.min(finite(user.tokensUsedToday), DAILY_TOKEN_LIMIT);
    return {
      used,
      limit: DAILY_TOKEN_LIMIT,
      remaining: Math.max(0, DAILY_TOKEN_LIMIT - used),
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
