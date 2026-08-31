"use node";

import * as React from "react";
import { v } from "convex/values";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { internalAction } from "./_generated/server";
import { VerificationCodeEmail } from "./emails/VerificationCodeEmail";
import { PlayTagEmail } from "./emails/PlayTagEmail";
import { NotificationEmail } from "./emails/NotificationEmail";
import { ContactAdminEmail } from "./emails/ContactAdminEmail";
import { ContactAutoReplyEmail } from "./emails/ContactAutoReplyEmail";

const SUPPORT_EMAIL = "support@meepletron.com";
// Automated mail sends from noreply@ (signals "don't reply"); the contact form
// sets a Reply-To so humans can still respond.
const DEFAULT_FROM = process.env.MAIL_FROM || "Meepletron <noreply@meepletron.com>";

// Lazily constructed — the Resend SDK throws if the key is missing, and we don't
// want that to fail module analysis at push time (only when actually sending).
let _resend: Resend | null = null;
function client(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return (_resend ??= new Resend(key));
}

/** Render a React Email element to HTML + plaintext and send it via Resend. */
async function sendEmail(opts: {
  to: string;
  subject: string;
  element: React.ReactElement;
  replyTo?: string;
  from?: string;
}) {
  const html = await render(opts.element);
  const text = await render(opts.element, { plainText: true });
  return await client().emails.send({
    from: opts.from ?? DEFAULT_FROM,
    to: opts.to,
    subject: opts.subject,
    html,
    text,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
  });
}

/**
 * Send both contact-form emails: a notification to support (Reply-To set to the
 * visitor so hitting Reply drafts to them) and a friendly auto-reply to the
 * visitor (Reply-To support so their reply reaches a human). Best-effort per
 * message — one failing doesn't block the other.
 */
export const sendContactEmails = internalAction({
  args: { name: v.string(), email: v.string(), message: v.string() },
  handler: async (_ctx, { name, email, message }) => {
    // 1) Notify support.
    try {
      const { error } = await sendEmail({
        to: SUPPORT_EMAIL,
        replyTo: `"${name}" <${email}>`,
        subject: `Contact form: ${name}`,
        element: React.createElement(ContactAdminEmail, { name, email, message }),
      });
      if (error) console.error("Failed to send admin contact email:", error);
    } catch (err) {
      console.error("Failed to send admin contact email:", err);
    }

    // 2) Auto-reply to the visitor.
    try {
      const { error } = await sendEmail({
        to: email,
        replyTo: SUPPORT_EMAIL,
        subject: "Thanks for reaching out to Meepletron",
        element: React.createElement(ContactAutoReplyEmail, { name }),
      });
      if (error) console.error("Failed to send contact auto-reply:", error);
    } catch (err) {
      console.error("Failed to send contact auto-reply:", err);
    }
  },
});

/**
 * Tell someone they were added to a logged play by email, with a CTA to view it.
 * Best-effort; a send failure is logged, never thrown (mustn't block logging).
 */
export const sendPlayTagEmail = internalAction({
  args: {
    to: v.string(),
    recipientName: v.optional(v.string()),
    ownerName: v.string(),
    playTitle: v.string(),
    playUrl: v.string(),
  },
  handler: async (_ctx, { to, recipientName, ownerName, playTitle, playUrl }) => {
    try {
      const { error } = await sendEmail({
        to,
        subject: `${ownerName} added you to a play of ${playTitle}`,
        element: React.createElement(PlayTagEmail, {
          ownerName,
          playTitle,
          playUrl,
          recipientName,
        }),
      });
      if (error) console.error("Failed to send play-tag email:", error);
    } catch (err) {
      console.error("Failed to send play-tag email:", err);
    }
  },
});

/**
 * A generic in-app-notification nudge (friend request / comment / mention),
 * gated by the recipient's email preferences at the call site. Best-effort.
 */
export const sendNotificationEmail = internalAction({
  args: {
    to: v.string(),
    recipientName: v.optional(v.string()),
    heading: v.string(),
    body: v.optional(v.string()),
    ctaLabel: v.string(),
    ctaUrl: v.string(),
    footerNote: v.string(),
    subject: v.string(),
  },
  handler: async (_ctx, args) => {
    try {
      const { error } = await sendEmail({
        to: args.to,
        subject: args.subject,
        element: React.createElement(NotificationEmail, {
          recipientName: args.recipientName,
          heading: args.heading,
          body: args.body,
          ctaLabel: args.ctaLabel,
          ctaUrl: args.ctaUrl,
          footerNote: args.footerNote,
        }),
      });
      if (error) console.error("Failed to send notification email:", error);
    } catch (err) {
      console.error("Failed to send notification email:", err);
    }
  },
});

/**
 * Email a one-time verification code (used by the Password provider's `verify`
 * flow — see convex/otp/EmailOtp.ts). Throws on failure so the sign-in surfaces
 * an error rather than leaving the user waiting for a code that never arrives.
 */
export const sendVerificationCode = internalAction({
  args: { to: v.string(), code: v.string() },
  handler: async (_ctx, { to, code }) => {
    const { error } = await sendEmail({
      to,
      subject: `Your Meepletron code: ${code}`,
      element: React.createElement(VerificationCodeEmail, { code }),
    });
    if (error) throw new Error(`Failed to send verification code: ${error.message}`);
  },
});
