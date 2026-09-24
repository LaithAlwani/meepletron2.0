import type { Metadata } from "next";
import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { decodeHtmlEntities } from "@/lib/htmlEntities";
import { SITE_URL } from "@/lib/site";

// Shared between generateMetadata and the layout body so the game is fetched
// once per request, not twice.
const getGame = cache((slug: string) =>
  fetchQuery(api.games.getByHandle, { handle: slug }).catch(() => null),
);

/** Decode entities and drop inline citation markers ("[1]") for clean prose. */
function clean(text: string): string {
  return decodeHtmlEntities(text).replace(/\s*\[\d+\]/g, "").trim();
}

/**
 * Per-game metadata so a shared link unfurls with the game's own cover (not the
 * default Meepletron card). Runs server-side; the detail page itself is a client
 * component, so the OG/Twitter tags + JSON-LD have to live on this server layout.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) return {};
  const cover = game.imageUrl ?? game.thumbnailUrl ?? undefined;
  const title = game.title;
  const description =
    (game.description ? clean(game.description).slice(0, 200) : "") ||
    `Rules, reference, and rulebook chat for ${game.title} on Meepletron.`;
  return {
    title,
    description,
    alternates: { canonical: `/boardgames/${game.slug}` },
    openGraph: {
      title: `${title} · Meepletron`,
      description,
      type: "website",
      ...(cover ? { images: [{ url: cover, alt: `${title} cover` }] } : {}),
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title: `${title} · Meepletron`,
      description,
      ...(cover ? { images: [cover] } : {}),
    },
  };
}

export default async function GameDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = await getGame(slug);

  const jsonLd = game
    ? [
        {
          "@context": "https://schema.org",
          "@type": "Game",
          name: game.title,
          url: `${SITE_URL}/boardgames/${game.slug}`,
          ...(game.description
            ? { description: clean(game.description) }
            : {}),
          ...(game.imageUrl || game.thumbnailUrl
            ? { image: game.imageUrl ?? game.thumbnailUrl }
            : {}),
          ...(game.minPlayers != null
            ? {
                numberOfPlayers: {
                  "@type": "QuantitativeValue",
                  minValue: game.minPlayers,
                  ...(game.maxPlayers != null
                    ? { maxValue: game.maxPlayers }
                    : {}),
                },
              }
            : {}),
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Library",
              item: `${SITE_URL}/boardgames`,
            },
            {
              "@type": "ListItem",
              position: 2,
              name: game.title,
              item: `${SITE_URL}/boardgames/${game.slug}`,
            },
          ],
        },
      ]
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {children}
    </>
  );
}
