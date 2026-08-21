import { ImageResponse } from "next/og";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Social-share image for a post: the post's hero (photo / cover) with its title
 * and a short subtitle overlaid — a 1200×630 card. Rendered at request time; the
 * hero is inlined as a data URI (Satori's remote fetch is unreliable serverless).
 * Never throws — falls back to a branded card.
 */
export const dynamic = "force-dynamic";
export const alt = "A post on Meepletron";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#dc4e26";

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
  sub,
  hero,
}: {
  title: string;
  eyebrow: string;
  sub: string | null;
  hero: string | null;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        backgroundColor: "#191512",
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
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background:
            "linear-gradient(to top, rgba(15,11,8,0.95) 24%, rgba(15,11,8,0.55) 58%, rgba(15,11,8,0.25) 100%)",
        }}
      />
      <div style={{ position: "absolute", left: 64, right: 64, bottom: 60, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 800, letterSpacing: 4, color: ACCENT, marginBottom: 14 }}>
          {eyebrow}
        </div>
        <div style={{ display: "flex", fontSize: 72, fontWeight: 800, color: "white", lineHeight: 1.05 }}>
          {title.length > 44 ? `${title.slice(0, 44)}…` : title}
        </div>
        {sub && (
          <div style={{ display: "flex", fontSize: 32, color: "rgba(255,255,255,0.85)", marginTop: 16 }}>
            {sub}
          </div>
        )}
      </div>
      <div style={{ position: "absolute", top: 52, left: 64, display: "flex", fontSize: 30, fontWeight: 800, color: "white", letterSpacing: 1 }}>
        meepletron
      </div>
    </div>
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  try {
    const { postId } = await params;
    const post = await fetchQuery(api.posts.getPost, {
      postId: postId as Id<"posts">,
    });
    if (!post) {
      return new ImageResponse(
        <Card title="A post on Meepletron" eyebrow="MEEPLETRON" sub={null} hero={null} />,
        size,
      );
    }
    let hero: string | null = null;
    let title = "";
    let eyebrow = "MEEPLETRON";
    let sub: string | null = post.caption ?? null;
    if (post.kind === "play") {
      hero =
        (await toDataUri(post.photoUrls[0] ?? null)) ??
        (await toDataUri(post.coverUrl));
      title = post.title;
      eyebrow = "MEEPLETRON PLAY";
      sub = post.winners.length ? `🏆 ${post.winners.slice(0, 3).join(", ")}` : sub;
    } else if (post.kind === "image") {
      hero = await toDataUri(post.photoUrls[0] ?? null);
      title = post.caption ?? `${post.owner.name}'s photos`;
      sub = post.caption ? `by ${post.owner.name}` : null;
    } else {
      hero = await toDataUri(post.covers[0] ?? null);
      title = post.listTitle ?? `Top ${post.size}`;
      eyebrow = `TOP ${post.size} · ${post.year}`;
      sub = `by ${post.owner.name}`;
    }
    return new ImageResponse(<Card title={title} eyebrow={eyebrow} sub={sub} hero={hero} />, size);
  } catch {
    return new ImageResponse(
      <Card title="A post on Meepletron" eyebrow="MEEPLETRON" sub={null} hero={null} />,
      size,
    );
  }
}
