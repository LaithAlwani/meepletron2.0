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
// Origins the Google OAuth flow may hand the browser back to. In prod that's
// just the real site (`SITE_URL`); in dev we also allow the common localhost
// ports so sign-in returns to whichever port `next dev` grabbed (3000 is often
// already taken), instead of always bouncing to the single `SITE_URL` port.
const ALLOWED_REDIRECT_ORIGINS = [
  process.env.SITE_URL,
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
].filter((o): o is string => !!o);

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({ verify: EmailOtp }), Google, Anonymous()],
  callbacks: {
    /**
     * Gate the post-OAuth redirect. Relative targets are always safe (they
     * resolve against `SITE_URL`); an absolute target must exactly match one of
     * the allowed origins — the trailing-slash check blocks look-alikes like
     * `http://localhost:3000.evil.com` that would otherwise capture the session
     * code. This is what lets a sign-in started on :3001 come back to :3001.
     */
    async redirect({ redirectTo }) {
      if (redirectTo.startsWith("/") || redirectTo.startsWith("?")) {
        return redirectTo;
      }
      if (
        ALLOWED_REDIRECT_ORIGINS.some(
          (o) => redirectTo === o || redirectTo.startsWith(o + "/"),
        )
      ) {
        return redirectTo;
      }
      throw new Error(`Invalid redirectTo: ${redirectTo}`);
    },
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
