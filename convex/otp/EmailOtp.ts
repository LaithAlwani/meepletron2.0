import { Email } from "@convex-dev/auth/providers/Email";
import type { GenericActionCtxWithAuthConfig } from "@convex-dev/auth/server";
import type { GenericDataModel } from "convex/server";
import { internal } from "../_generated/api";

/**
 * A one-time-code email provider used to verify Password sign-ups/sign-ins
 * (wired into `Password({ verify })` in convex/auth.ts). Convex Auth invokes
 * `sendVerificationRequest` in an action context (passed as the 2nd arg at
 * runtime, though the library's type only declares the first), so we schedule
 * the branded email through convex/email.ts (nodemailer). 6-digit, 15-min expiry.
 */
export const EmailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15,
  // Crypto-based (Math.random isn't allowed in the Convex runtime).
  generateVerificationToken: async () => {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const n = new DataView(bytes.buffer).getUint32(0) % 1_000_000;
    return n.toString().padStart(6, "0");
  },
  sendVerificationRequest: async (
    { identifier: email, token }: { identifier: string; token: string },
    ctx?: GenericActionCtxWithAuthConfig<GenericDataModel>,
  ) => {
    await ctx!.runAction(internal.email.sendVerificationCode, {
      to: email,
      code: token,
    });
  },
});
