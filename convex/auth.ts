import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { EmailOtp } from "./otp/EmailOtp";

/**
 * Auth is handled entirely in Convex (no Clerk).
 *
 * - Password: email + password, with a one-time email code (`verify: EmailOtp`)
 *   confirmed before the sign-up/sign-in completes. Verification also lets a new
 *   account safely adopt a reserved imported row by email (see
 *   `afterUserCreatedOrUpdated` + convex/migrations.ts importOldUsers).
 * - Google: OAuth. Requires `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` env vars on
 *   the Convex deployment (`npx convex env set ...`); the button is inert until set.
 * - Anonymous: guests get a real identity so the daily token budget is enforced
 *   server-side (not via bypassable localStorage).
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({ verify: EmailOtp }), Google, Anonymous()],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
      // Once this account's email is verified (Google immediately, Password
      // after the emailed code), adopt a reserved imported row with the same
      // email, if any. Runs in a typed internal mutation (this callback's ctx.db
      // is generically typed and can't use the `email` index). Only a verified
      // email can claim a reserved identity — no unverified takeover.
      const current = await ctx.db.get("users", userId);
      if (current?.email && current.emailVerificationTime !== undefined) {
        await ctx.scheduler.runAfter(0, internal.users.adoptReservedRow, {
          userId,
        });
      }

      // The rest only seeds brand-new users (existingUserId is null on first
      // sign-in). The Anonymous provider sets `isAnonymous` itself.
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
