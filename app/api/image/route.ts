import type { NextRequest } from "next/server";

/**
 * Same-origin image proxy. The tuckbox designer needs to *read* an image's bytes
 * (fetch → data URL) to embed it in the box artwork, but BoardGameGeek's CDN
 * doesn't send CORS headers, so a direct cross-origin fetch is blocked. Fetching
 * through this route (same origin) sidesteps that. Locked to known image hosts
 * so it can't be used as an open proxy.
 */
function allowed(host: string): boolean {
  return (
    host === "geekdo-images.com" ||
    host.endsWith(".geekdo-images.com") ||
    host.endsWith(".convex.cloud")
  );
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new Response("Missing url", { status: 400 });

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  if (target.protocol !== "https:" || !allowed(target.hostname)) {
    return new Response("Forbidden", { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: { "user-agent": "Meepletron/1.0 (+https://www.meepletron.com)" },
    });
  } catch {
    return new Response("Upstream fetch failed", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream error", { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return new Response("Not an image", { status: 415 });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400, immutable",
    },
  });
}
