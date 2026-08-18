import { ImageResponse } from "next/og";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { categoryLabel } from "@/convex/lib/topGamesCategories";

/**
 * The social-share (Open Graph) image for a shared Top Games list: the list's
 * cover collage with its title overlaid — a big 1200×630 card, so it unfurls as
 * a large banner rather than a small square. Server-generated per list.
 */

// Generate at request time, not during `next build`: the image reads list data
// via fetchQuery, and the build's Convex deploy key can't view data. At runtime
// it queries the public deployment (an unauthenticated read of a public list).
export const dynamic = "force-dynamic";

export const alt = "A Top Games list on Meepletron";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#f0603a";

export default async function Image({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;

  let title = "Top board games";
  let eyebrow = "TOP GAMES";
  let who: string | null = null;
  let covers: string[] = [];

  try {
    const list = await fetchQuery(api.topGames.getList, {
      id: listId as Id<"topGamesLists">,
    });
    if (list) {
      title = list.title?.trim() || `Top ${list.size} board games`;
      const cat =
        list.category !== "overall" ? `${categoryLabel(list.category)} · ` : "";
      eyebrow = `TOP ${list.size} · ${cat}${list.year}`.toUpperCase();
      who =
        list.author?.name ??
        (list.author?.username ? `@${list.author.username}` : null);
      covers = list.items
        .map((i) => i.game?.thumbUrl)
        .filter((u): u is string => !!u)
        .slice(0, 5);
    }
  } catch {
    // fall through to the branded fallback below
  }

  const coverW = covers.length > 0 ? `${100 / covers.length}%` : "0%";

  return new ImageResponse(
    (
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
    ),
    size,
  );
}
