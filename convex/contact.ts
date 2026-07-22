import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin } from "./lib/auth";

const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_PER_WINDOW = 3;

/** Public contact form submission (honeypot + rate limiting + email notify). */
export const submit = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    message: v.string(),
    company: v.optional(v.string()),
  },
  handler: async (ctx, { name, email, message, company }) => {
    // Honeypot: real users leave this hidden field empty. Silently accept so
    // bots don't learn they were caught.
    if (company && company.trim()) return;

    // Strip CR/LF to prevent email header injection, then validate.
    const n = name.replace(/[\r\n]/g, " ").trim();
    const e = email.replace(/[\r\n]/g, "").trim();
    const m = message.trim();
    if (!n || !e || !m) throw new Error("All fields are required");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      throw new Error("Enter a valid email address");
    }

    // Rate limit: at most MAX_PER_WINDOW submissions per email per window.
    // (Convex mutations can't see the client IP, so we key on the email — the
    // equivalent abuse guard to the old app's per-IP limit.)
    const cutoff = Date.now() - RATE_WINDOW_MS;
    const recent = await ctx.db
      .query("contactMessages")
      .withIndex("by_email", (q) => q.eq("email", e))
      .order("desc")
      .take(MAX_PER_WINDOW);
    if (
      recent.length >= MAX_PER_WINDOW &&
      recent.every((r) => r._creationTime > cutoff)
    ) {
      throw new Error("Too many messages. Please try again in a minute.");
    }

    await ctx.db.insert("contactMessages", { name: n, email: e, message: m });

    // Fire the notification + auto-reply emails (Node action) out of band.
    await ctx.scheduler.runAfter(0, internal.email.sendContactEmails, {
      name: n,
      email: e,
      message: m,
    });
  },
});

/** Admin: recent contact messages. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("contactMessages").order("desc").take(200);
  },
});
