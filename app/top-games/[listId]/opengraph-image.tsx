import { ImageResponse } from "next/og";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { categoryLabel } from "@/convex/lib/topGamesCategories";

/**
 * The social-share (Open Graph) image for a shared Top Games list: the list's
 * cover collage with its title overlaid — a big 1200×630 card, so it unfurls as
 * a large banner rather than a small square. Server-generated per list.
 *
 * Covers are fetched here and inlined as data URIs: the renderer (Satori) fetches
 * remote <img> URLs unreliably in serverless, so we hand it the bytes directly.
 * The whole handler is guarded — any failure still returns a branded card.
 */

// Generate at request time, not during `next build`: the image reads list data
// via fetchQuery, and the build's Convex deploy key can't view data. At runtime
// it queries the public deployment (an unauthenticated read of a public list).
export const dynamic = "force-dynamic";

export const alt = "A Top Games list on Meepletron";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#f0603a";

/**
 * Fetch an image and inline it as a `data:` URI so Satori never has to fetch it
 * itself. Returns null on any failure so a broken cover is simply skipped.
 */
async function toDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    return `data:${type};base64,${b64}`;
  } catch {
    return null;
  }
}

/** The card layout, shared by the real image and the fallback. */
function Card({
  title,
  eyebrow,
  who,
  covers,
}: {
  title: string;
  eyebrow: string;
  who: string | null;
  covers: string[];
}) {
  const coverW = covers.length > 0 ? `${100 / covers.length}%` : "0%";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        backgroundColor: "#0e0e10",
        fontFamily: "sans-serif",
      }}
    >
      {/* Cover collage — fills the frame. */}
      <div style={{ position: "absolute", inset: 0, display: "flex" }}>
        {covers.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt=""
            width={240}
            height={630}
            style={{ width: coverW, height: "100%", objectFit: "cover" }}
          />
        ))}
      </div>

      {/* Legibility scrim, heavier toward the bottom. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background:
            "linear-gradient(to top, rgba(6,6,8,0.94) 22%, rgba(6,6,8,0.55) 55%, rgba(6,6,8,0.25) 100%)",
        }}
      />

      {/* Text block. */}
      <div
        style={{
          position: "absolute",
          left: 64,
          right: 64,
          bottom: 60,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: 4,
            color: ACCENT,
            marginBottom: 14,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 82,
            fontWeight: 800,
            color: "white",
            lineHeight: 1.05,
          }}
        >
          {title.length > 40 ? `${title.slice(0, 40)}…` : title}
        </div>
        {who && (
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "rgba(255,255,255,0.82)",
              marginTop: 18,
            }}
          >
            by {who}
          </div>
        )}
      </div>

      {/* Wordmark. */}
      <div
        style={{
          position: "absolute",
          top: 52,
          left: 64,
          display: "flex",
          fontSize: 30,
          fontWeight: 800,
          color: "white",
          letterSpacing: 1,
        }}
      >
        meepletron
      </div>
    </div>
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  try {
    const { listId } = await params;
    const list = await fetchQuery(api.topGames.getList, {
      id: listId as Id<"topGamesLists">,
    });

    if (!list) {
      return new ImageResponse(
        <Card title="Top board games" eyebrow="TOP GAMES" who={null} covers={[]} />,
        size,
      );
    }

    const title = list.title?.trim() || `Top ${list.size} board games`;
    const cat =
      list.category !== "overall" ? `${categoryLabel(list.category)} · ` : "";
    const eyebrow = `TOP ${list.size} · ${cat}${list.year}`.toUpperCase();
    const who =
      list.author?.name ??
      (list.author?.username ? `@${list.author.username}` : null);

    // Inline up to 5 covers as data URIs; drop any that fail to load.
    const urls = list.items
      .map((i) => i.game?.thumbUrl)
      .filter((u): u is string => !!u)
      .slice(0, 5);
    const covers = (await Promise.all(urls.map(toDataUri))).filter(
      (u): u is string => u !== null,
    );

    return new ImageResponse(
      <Card title={title} eyebrow={eyebrow} who={who} covers={covers} />,
      size,
    );
  } catch {
    // Never 500 the unfurl — fall back to a clean branded card.
    return new ImageResponse(
      <Card title="Top board games" eyebrow="TOP GAMES" who={null} covers={[]} />,
      size,
    );
  }
}
