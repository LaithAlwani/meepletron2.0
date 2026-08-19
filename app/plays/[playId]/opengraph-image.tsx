import { ImageResponse } from "next/og";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Social-share image for a public play: the game cover (or a live photo) with the
 * title, date, and winner(s) overlaid — a big 1200×630 card. Rendered at request
 * time; the hero image is inlined as a data URI (Satori's remote fetch is
 * unreliable in serverless). Never throws — falls back to a branded card.
 */
export const dynamic = "force-dynamic";
export const alt = "A board-game play on Meepletron";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#f0603a";

async function toDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
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

function Card({
  title,
  eyebrow,
  winners,
  hero,
}: {
  title: string;
  eyebrow: string;
  winners: string | null;
  hero: string | null;
}) {
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
      {hero && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={hero}
          alt=""
          width={1200}
          height={630}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background:
            "linear-gradient(to top, rgba(6,6,8,0.95) 24%, rgba(6,6,8,0.55) 58%, rgba(6,6,8,0.25) 100%)",
        }}
      />
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
            fontSize: 76,
            fontWeight: 800,
            color: "white",
            lineHeight: 1.05,
          }}
        >
          {title.length > 42 ? `${title.slice(0, 42)}…` : title}
        </div>
        {winners && (
          <div
            style={{
              display: "flex",
              fontSize: 32,
              color: "rgba(255,255,255,0.85)",
              marginTop: 16,
            }}
          >
            🏆 {winners}
          </div>
        )}
      </div>
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
  params: Promise<{ playId: string }>;
}) {
  try {
    const { playId } = await params;
    const play = await fetchQuery(api.plays.getPlay, {
      playId: playId as Id<"plays">,
    });
    if (!play) {
      return new ImageResponse(
        <Card title="A board-game play" eyebrow="MEEPLETRON PLAYS" winners={null} hero={null} />,
        size,
      );
    }
    // Prefer the first live photo; fall back to the game cover only if it's
    // missing or fails to load, so a shared play always leads with its photo.
    const hero =
      (await toDataUri(play.photoUrls[0] ?? null)) ??
      (await toDataUri(play.coverUrl));
    const winners = play.winners.length
      ? play.winners.slice(0, 3).join(", ")
      : null;
    return new ImageResponse(
      <Card title={play.title} eyebrow={play.date} winners={winners} hero={hero} />,
      size,
    );
  } catch {
    return new ImageResponse(
      <Card title="A board-game play" eyebrow="MEEPLETRON PLAYS" winners={null} hero={null} />,
      size,
    );
  }
}
