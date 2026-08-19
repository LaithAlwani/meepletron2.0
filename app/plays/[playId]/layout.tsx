import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Per-play metadata so a shared public play unfurls with its own title, winner,
 * and a large cover/photo image. Server-side; the page itself is a client
 * component. Private/missing plays fall back to nothing (no unfurl).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ playId: string }>;
}): Promise<Metadata> {
  const { playId } = await params;
  try {
    const play = await fetchQuery(api.plays.getPlay, {
      playId: playId as Id<"plays">,
    });
    if (!play) return {};
    const who = play.winners.length
      ? `${play.winners.slice(0, 2).join(" & ")} won`
      : `${play.players.length} players`;
    const title = `${play.title} — ${who}`;
    const description = `A play of ${play.title} on ${play.date}${
      play.ownerName ? `, logged by ${play.ownerName}` : ""
    }.`;
    return {
      title,
      description,
      openGraph: { title: `${title} · Meepletron`, description, type: "website" },
      twitter: {
        card: "summary_large_image",
        title: `${title} · Meepletron`,
        description,
      },
    };
  } catch {
    return {};
  }
}

export default function PlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
