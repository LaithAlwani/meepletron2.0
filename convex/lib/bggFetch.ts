/**
 * Shared BoardGameGeek HTTP layer.
 *
 * BGG closed anonymous API access in July 2025 — every call needs the app-level
 * `BGG_API_TOKEN`. Reads (collection, plays, thing) use only that token; a
 * user's session cookie is attached solely when private fields are requested,
 * which keeps public sync working even if the login flow breaks.
 */

const BGG_BASE = "https://boardgamegeek.com";
const USER_AGENT = "Meepletron/1.0 (board game rules assistant)";

/** Consecutive-failure ceiling before a sync job gives up. ~5 min of polling. */
export const MAX_ATTEMPTS = 10;

export type BggResponse = {
  status: number;
  xml: string;
};

/**
 * BGG answers the first request for a collection with **202 Accepted** while it
 * builds the response server-side, then 200 on a later identical request. Note
 * that `res.ok` is true for 202, so status must be checked explicitly — reading
 * the body of a 202 yields a `<message>`, not items.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 202 || status === 429 || status >= 500;
}

/**
 * Exponential backoff with jitter. The jitter matters: without it, several
 * users whose syncs start together stay synchronised through every retry and
 * hit BGG in lockstep.
 */
export function backoffMs(attempts: number): number {
  const raw = Math.min(60_000, 4_000 * 2 ** attempts); // 4s, 8s, 16s, 32s, 60s…
  return raw + Math.floor(Math.random() * 1_000);
}

/**
 * GET a BGG XML endpoint. Returns the status alongside the body so callers can
 * classify 202 themselves; only network-level failures throw.
 */
export async function bggGet(
  path: string,
  params: Record<string, string | number | undefined>,
  opts: { token: string; cookie?: string } = { token: "" },
): Promise<BggResponse> {
  const query = new URLSearchParams();
  for (const [k, val] of Object.entries(params)) {
    if (val !== undefined) query.set(k, String(val));
  }
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Authorization: `Bearer ${opts.token}`,
  };
  if (opts.cookie) headers.Cookie = opts.cookie;

  const res = await fetch(`${BGG_BASE}${path}?${query.toString()}`, { headers });
  return { status: res.status, xml: await res.text() };
}

/**
 * Exchange a username + password for a BGG session cookie.
 *
 * BGG has no OAuth; this is the undocumented endpoint its own web front end
 * uses, and it can change without notice. The password is used here and nowhere
 * else — the caller stores only the returned cookie, sealed.
 *
 * Returns null when the credentials are rejected, so callers can classify the
 * failure without ever handling the response body.
 */
export async function bggLogin(
  username: string,
  password: string,
): Promise<{ cookie: string; expiresAt?: number } | null> {
  const res = await fetch(`${BGG_BASE}/login/api/v1`, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ credentials: { username, password } }),
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`bgg_login_${res.status}`);

  // getSetCookie() keeps the individual Set-Cookie headers separate; the older
  // get("set-cookie") folds them into one string and mangles cookie dates.
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];

  const pairs: string[] = [];
  let expiresAt: number | undefined;
  for (const line of raw) {
    if (!line) continue;
    const [pair] = line.split(";");
    if (pair && pair.includes("=")) pairs.push(pair.trim());
    const maxAge = line.match(/Max-Age=(\d+)/i);
    if (maxAge) {
      const candidate = Date.now() + Number(maxAge[1]) * 1000;
      if (!expiresAt || candidate < expiresAt) expiresAt = candidate;
    }
  }
  if (!pairs.length) return null;
  return { cookie: pairs.join("; "), expiresAt };
}
