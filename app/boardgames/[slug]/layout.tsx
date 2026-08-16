import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

/**
 * Per-game metadata so a shared link unfurls with the game's own cover (not the
 * default Meepletron card). Runs server-side; the detail page itself is a client
 * component, so the OG/Twitter tags have to live on this server layout.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const game = await fetchQuery(api.games.getByHandle, { handle: slug });
    if (!game) return {};
    const cover = game.imageUrl ?? game.thumbnailUrl ?? undefined;
    const title = game.title;
    const description =
      (game.description?.trim().slice(0, 200) ||
        `Rules, reference, and rulebook chat for ${game.title} on Meepletron.`) ??
      undefined;
    return {
      title,
      description,
      openGraph: {
        title: `${title} · Meepletron`,
        description,
        type: "website",
        ...(cover
          ? { images: [{ url: cover, alt: `${title} cover` }] }
          : {}),
      },
      twitter: {
        card: cover ? "summary_large_image" : "summary",
        title: `${title} · Meepletron`,
        description,
        ...(cover ? { images: [cover] } : {}),
      },
    };
  } catch {
    // Fall back to the site defaults if the lookup fails.
    return {};
  }
}

export default function GameDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
