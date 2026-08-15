/**
 * AES-GCM seal/open for the stored BGG session cookie.
 *
 * We never store the user's BGG password — it is exchanged for a session cookie
 * at link time and discarded. The cookie is still a live credential, so it is
 * encrypted at rest under `BGG_CRED_KEY` (a 32-byte key, base64). An attacker
 * needs both the database and the deployment env var.
 *
 * Uses the Web Crypto API, which the Convex V8 runtime provides — no
 * `"use node"`, which matters because the sync module exports mutations
 * alongside its actions and a `"use node"` file may export only actions. If a
 * deploy ever proves otherwise, this file is the only thing that has to move.
 */

export type Sealed = { ct: string; iv: string };

const IV_BYTES = 12; // AES-GCM standard nonce length

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// The explicit ArrayBuffer type parameter matters: a bare `Uint8Array` is
// backed by `ArrayBufferLike`, which WebCrypto's BufferSource won't accept.
function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(): Promise<CryptoKey> {
  const raw = process.env.BGG_CRED_KEY;
  if (!raw) {
    throw new Error(
      "BGG_CRED_KEY is not set. Generate one with `openssl rand -base64 32` and set it with: npx convex env set BGG_CRED_KEY <key>",
    );
  }
  const bytes = fromBase64(raw);
  if (bytes.length !== 32) {
    throw new Error("BGG_CRED_KEY must be 32 bytes, base64-encoded.");
  }
  return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt a secret for storage. A fresh IV per call — never reuse one. */
export async function seal(plaintext: string): Promise<Sealed> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ct: toBase64(new Uint8Array(ct)), iv: toBase64(iv) };
}

/**
 * Decrypt a stored secret. Throws if the key changed or the value was tampered
 * with (GCM authenticates); callers treat that as "needs re-auth", not a crash.
 */
export async function open(sealed: Sealed): Promise<string> {
  const key = await importKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(sealed.iv) },
    key,
    fromBase64(sealed.ct),
  );
  return new TextDecoder().decode(plain);
}
