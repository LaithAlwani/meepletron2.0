import type { Metadata } from "next";

/**
 * Default metadata for the Top Games section. The index page (/top-games) is a
 * client component, so its title/description live here on a server layout. The
 * list detail route (/top-games/[listId]) overrides these with its own per-list
 * metadata. No `canonical` here so it isn't inherited by child routes.
 */
const description =
  "Yearly top-games lists from the Meepletron community — rank your favourite board games and compare year over year.";

export const metadata: Metadata = {
  title: "Top Games",
  description,
  openGraph: {
    title: "Top Games · Meepletron",
    description,
    type: "website",
  },
};

export default function TopGamesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
