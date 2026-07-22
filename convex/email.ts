"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import nodemailer from "nodemailer";

const SUPPORT_EMAIL = "support@meepletron.com";
const SITE_URL = process.env.SITE_URL || "https://www.meepletron.com";

// Brand tokens (inline styles for email-client compatibility).
const BRAND_PRIMARY = "#2563eb";
const TEXT_HEADING = "#0f172a";
const TEXT_BODY = "#334155";
const TEXT_MUTED = "#64748b";
const SURFACE = "#ffffff";
const BG = "#f8fafc";
const BORDER = "#e2e8f0";

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
}: {
  previewText?: string;
  bodyHtml: string;
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
              <p style="margin:0;">You're receiving this because you contacted us. If this wasn't you, you can safely ignore it.</p>
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
