import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

/**
 * Auth is handled entirely in Convex (no Clerk).
 *
 * - Password: email + password baseline.
 * - Google: OAuth. Requires `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` env vars on
 *   the Convex deployment (`npx convex env set ...`); the button is inert until set.
 * - Anonymous: guests get a real identity so the daily token budget is enforced
 *   server-side (not via bypassable localStorage).
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password(), Google, Anonymous()],
  callbacks: {
    // Only fires for brand-new users (existingUserId is null on first sign-in).
    // Seed app defaults here; the Anonymous provider sets `isAnonymous` itself.
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
      if (existingUserId) return;
      await ctx.db.patch("users", userId, {
        role: "user",
        tokensUsedToday: 0,
        tokensResetAt: Date.now(),
      });
      // Claim any plays a friend recorded them in by email, so a new sign-up
      // inherits their history. Scheduled so it can batch out of band.
      const user = await ctx.db.get("users", userId);
      if (user?.email) {
        await ctx.scheduler.runAfter(0, internal.plays.claimPlaysByEmail, {
          userId,
          email: user.email,
        });
      }
    },
  },
});
