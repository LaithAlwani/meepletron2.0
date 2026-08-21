"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import nodemailer from "nodemailer";

const SUPPORT_EMAIL = "support@meepletron.com";
const SITE_URL = process.env.SITE_URL || "https://www.meepletron.com";

// Brand tokens — Meepletron's light theme (warm tangerine on cream). Inline
// styles for email-client compatibility.
const BRAND_PRIMARY = "#dc4e26"; // tangerine accent
const TEXT_HEADING = "#221d18"; // warm ink
const TEXT_BODY = "#463c33";
const TEXT_MUTED = "#8a7c6d";
const SURFACE = "#ffffff";
const BG = "#faf6ee"; // warm cream
const BORDER = "#ece3d5"; // warm sand

function transporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: (process.env.SMTP_SECURE ?? "true") !== "false",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function escapeHtml(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Table-based, inline-styled shell that renders across Gmail/Outlook/Apple. */
function emailLayout({
  previewText = "",
  bodyHtml,
  footerNote = "You're receiving this because you contacted us. If this wasn't you, you can safely ignore it.",
}: {
  previewText?: string;
  bodyHtml: string;
  footerNote?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Meepletron</title>
</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT_BODY};">
  <span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(previewText)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:${SURFACE};border:1px solid ${BORDER};border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background-color:${BRAND_PRIMARY};padding:24px;text-align:center;">
              <a href="${SITE_URL}" style="text-decoration:none;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.02em;">Meepletron</a>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px 32px;color:${TEXT_BODY};font-size:15px;line-height:1.6;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px 32px;border-top:1px solid ${BORDER};color:${TEXT_MUTED};font-size:12px;line-height:1.5;">
              <p style="margin:0 0 6px 0;">
                <a href="${SITE_URL}" style="color:${BRAND_PRIMARY};text-decoration:none;font-weight:600;">Meepletron</a> · Your board game rules assistant.
              </p>
              <p style="margin:0;">${escapeHtml(footerNote)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send both contact-form emails: a notification to support (Reply-To set to the
 * visitor so hitting Reply drafts to them) and a friendly auto-reply to the
 * visitor. Best-effort per message — one failing doesn't block the other.
 */
export const sendContactEmails = internalAction({
  args: { name: v.string(), email: v.string(), message: v.string() },
  handler: async (_ctx, { name, email, message }) => {
    const t = transporter();
    const from = process.env.MAIL_FROM || `Meepletron <${SUPPORT_EMAIL}>`;

    // 1) Notify support.
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");
    const adminBody = `
      <h2 style="margin:0 0 12px 0;font-size:20px;color:${TEXT_HEADING};font-weight:700;">New contact form submission</h2>
      <p style="margin:0 0 20px 0;color:${TEXT_MUTED};">Hit Reply to respond directly to <strong style="color:${TEXT_BODY};">${safeName}</strong>.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BORDER};border-radius:12px;background-color:${BG};">
        <tr><td style="padding:14px 18px;border-bottom:1px solid ${BORDER};">
          <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:${TEXT_MUTED};font-weight:600;">From</p>
          <p style="margin:4px 0 0 0;font-size:15px;color:${TEXT_HEADING};font-weight:600;">${safeName}</p>
          <p style="margin:2px 0 0 0;font-size:13px;color:${TEXT_BODY};"><a href="mailto:${safeEmail}" style="color:${BRAND_PRIMARY};text-decoration:none;">${safeEmail}</a></p>
        </td></tr>
        <tr><td style="padding:14px 18px;">
          <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:${TEXT_MUTED};font-weight:600;">Message</p>
          <p style="margin:8px 0 0 0;font-size:15px;line-height:1.6;color:${TEXT_BODY};">${safeMessage}</p>
        </td></tr>
      </table>`;
    try {
      await t.sendMail({
        from,
        to: SUPPORT_EMAIL,
        replyTo: `"${name}" <${email}>`,
        subject: `Contact form: ${name}`,
        text: `New contact form submission\n\nFrom: ${name} <${email}>\n\n${message}\n\n— Reply to this email to respond to ${name} directly.`,
        html: emailLayout({ previewText: `New message from ${name}`, bodyHtml: adminBody }),
      });
    } catch (err) {
      console.error("Failed to send admin contact email:", err);
    }

    // 2) Auto-reply to the visitor.
    const replyBody = `
      <h2 style="margin:0 0 12px 0;font-size:20px;color:${TEXT_HEADING};font-weight:700;">Thanks for reaching out, ${safeName}!</h2>
      <p style="margin:0 0 12px 0;">We've received your message and we'll get back to you as soon as we can — usually within a day or two.</p>
      <p style="margin:0 0 20px 0;">In the meantime, you can keep exploring rulebooks and chatting with games at <a href="${SITE_URL}" style="color:${BRAND_PRIMARY};text-decoration:none;font-weight:600;">meepletron.com</a>.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;">
        <tr><td style="border-radius:10px;background-color:${BRAND_PRIMARY};">
          <a href="${SITE_URL}/boardgames" style="display:inline-block;padding:10px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Browse board games</a>
        </td></tr>
      </table>
      <p style="margin:0;color:${TEXT_MUTED};font-size:13px;">— The Meepletron team</p>`;
    try {
      await t.sendMail({
        from,
        to: email,
        subject: "Thanks for reaching out to Meepletron",
        text: `Hi ${name},\n\nThanks for reaching out to Meepletron! We've received your message and will get back to you as soon as we can — usually within a day or two.\n\nIn the meantime, you can keep exploring rulebooks at ${SITE_URL}.\n\n— The Meepletron team`,
        html: emailLayout({ previewText: "We received your message.", bodyHtml: replyBody }),
      });
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
    const t = transporter();
    const from = process.env.MAIL_FROM || `Meepletron <${SUPPORT_EMAIL}>`;
    const who = escapeHtml(ownerName);
    const game = escapeHtml(playTitle);
    const hello = recipientName?.trim()
      ? `Hi ${escapeHtml(recipientName.trim())},`
      : "Hi there,";
    const url = encodeURI(playUrl);

    const body = `
      <h2 style="margin:0 0 12px 0;font-size:20px;color:${TEXT_HEADING};font-weight:700;">${who} added you to a game night 🎲</h2>
      <p style="margin:0 0 12px 0;">${hello}</p>
      <p style="margin:0 0 12px 0;"><strong style="color:${TEXT_HEADING};">${who}</strong> logged a play of <strong style="color:${TEXT_HEADING};">${game}</strong> on Meepletron and added you as one of the players.</p>
      <p style="margin:0 0 22px 0;">Head over to see the scores, who won, and the photos from the table.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
        <tr><td style="border-radius:12px;background-color:${BRAND_PRIMARY};">
          <a href="${url}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">See the play</a>
        </td></tr>
      </table>
      <p style="margin:0;color:${TEXT_MUTED};font-size:13px;">Sign in with this email address to keep every game you're tagged in — and log your own.</p>`;

    try {
      await t.sendMail({
        from,
        to,
        subject: `${ownerName} added you to a play of ${playTitle}`,
        text: `${ownerName} logged a play of ${playTitle} on Meepletron and added you as a player.\n\nSee the play: ${playUrl}\n\nSign in with this email to keep every game you're tagged in.\n\n— Meepletron`,
        html: emailLayout({
          previewText: `${ownerName} added you to a play of ${playTitle}`,
          bodyHtml: body,
          footerNote: `You're receiving this because ${ownerName} logged a game with your email on Meepletron.`,
        }),
      });
    } catch (err) {
      console.error("Failed to send play-tag email:", err);
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
    const t = transporter();
    const from = process.env.MAIL_FROM || `Meepletron <${SUPPORT_EMAIL}>`;
    const safe = escapeHtml(code);
    const body = `
      <h2 style="margin:0 0 12px 0;font-size:20px;color:${TEXT_HEADING};font-weight:700;">Confirm your email</h2>
      <p style="margin:0 0 16px 0;">Enter this code to finish signing in to Meepletron. It expires in 15 minutes.</p>
      <div style="margin:0 0 20px 0;padding:16px 0;text-align:center;border:1px solid ${BORDER};border-radius:12px;background-color:${BG};">
        <span style="font-size:34px;font-weight:800;letter-spacing:10px;color:${TEXT_HEADING};font-family:'Courier New',monospace;">${safe}</span>
      </div>
      <p style="margin:0;color:${TEXT_MUTED};font-size:13px;">If you didn't try to sign in, you can safely ignore this email.</p>`;
    await t.sendMail({
      from,
      to,
      subject: `Your Meepletron code: ${code}`,
      text: `Your Meepletron verification code is ${code}. It expires in 15 minutes.\n\nIf you didn't try to sign in, you can ignore this email.`,
      html: emailLayout({
        previewText: `Your Meepletron code is ${code}`,
        bodyHtml: body,
        footerNote:
          "You're receiving this because this email was used to sign in to Meepletron.",
      }),
    });
  },
});
