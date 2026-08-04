import { ConvexError } from "convex/values";

/**
 * Turn any thrown value into a short, human-readable message — never a raw
 * Convex error string like "[CONVEX M(...)] [Request ID: …] Server Error".
 *
 * - `ConvexError`s reach the client verbatim (even in production), so their
 *   `data` is used directly.
 * - Plain `Error`s are stripped of Convex wrapper noise. In production Convex
 *   hides non-ConvexError messages behind a bare "Server Error", so when
 *   nothing meaningful survives we fall back to the caller's message.
 */
export function friendlyError(
  e: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (e instanceof ConvexError) {
    const d = e.data as unknown;
    if (typeof d === "string" && d.trim()) return d.trim();
    if (
      d &&
      typeof d === "object" &&
      "message" in d &&
      typeof (d as { message: unknown }).message === "string"
    ) {
      return (d as { message: string }).message;
    }
    return fallback;
  }

  if (e instanceof Error && e.message) {
    let msg = e.message;
    // Keep only the human part after "Uncaught (Convex)Error:" when present.
    const m = msg.match(/Uncaught (?:Convex)?Error:\s*([\s\S]*)/);
    if (m) msg = m[1];
    // First line only — drop stack frames.
    msg = msg.split("\n")[0];
    // Strip "[CONVEX …]" and "[Request ID: …]" tags and a "Server Error" prefix.
    msg = msg
      .replace(/\[CONVEX[^\]]*\]/g, "")
      .replace(/\[Request ID:[^\]]*\]/g, "")
      .replace(/^\s*Server Error:?\s*/i, "")
      .trim();
    if (!msg || /^server error$/i.test(msg) || msg.length < 2) return fallback;
    return msg;
  }

  return fallback;
}
