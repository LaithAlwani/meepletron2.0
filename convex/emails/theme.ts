/**
 * Shared brand tokens for the transactional email templates. Mirrors the site's
 * light theme (warm tangerine on cream). Email must be light-theme and use
 * absolute URLs + web-safe fonts — clients don't load our web fonts or CSS vars.
 */
export const colors = {
  brand: "#dc4e26", // tangerine accent
  brandDark: "#c6431f",
  ink: "#221d18", // warm ink (headings)
  body: "#463c33",
  muted: "#8a7c6d",
  subtle: "#9c9284",
  surface: "#ffffff",
  bg: "#faf6ee", // warm cream canvas
  sand: "#f3ece0",
  border: "#ece3d5",
  accent2: "#0d8f80", // teal (secondary)
  white: "#ffffff",
} as const;

export const fontStack =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const monoStack = "'SF Mono', 'Courier New', Courier, monospace";

/** Canonical production origin — used for links + the header logo so assets load
 *  regardless of which deployment sends (dev SITE_URL is localhost). */
export const SITE_URL = "https://www.meepletron.com";

/** Email-safe PNG (Outlook can't render .webp). */
export const LOGO_URL = `${SITE_URL}/logo_landscape.png`;

export const TAGLINE = "Board game night, shared.";
