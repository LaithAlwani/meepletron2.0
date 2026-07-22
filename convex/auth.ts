import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";

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
    },
  },
});
