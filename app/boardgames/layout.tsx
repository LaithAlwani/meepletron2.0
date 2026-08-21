import type { Metadata } from "next";

/**
 * Default metadata for the library section. The index page (/boardgames) is a
 * client component, so its title/description live here on a server layout. The
 * game detail route (/boardgames/[slug]) overrides these with its own per-game
 * metadata. No `canonical` here so it isn't inherited by child routes.
 */
const description =
  "Browse the board game library, look up rules with the AI referee, and track your collection on Meepletron.";

export const metadata: Metadata = {
  title: "Board game library",
  description,
  openGraph: {
    title: "Board game library · Meepletron",
    description,
    type: "website",
  },
};

export default function BoardgamesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
