import { mutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

/**
 * Admin-only: mint a short-lived upload URL. The client POSTs the file bytes
 * directly to it and gets back a `storageId`, which it then attaches via
 * `games.setGameImage` or `rulebooks.addRulebook`.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});
