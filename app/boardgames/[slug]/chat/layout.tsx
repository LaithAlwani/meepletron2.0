import type { Metadata } from "next";
import { getGameCached } from "@/lib/gameCache";

/**
 * The chat page itself is a client component, which can't export metadata, so
 * its title is set here on a server layout. It overrides the parent game
 * layout's "… | Board Game" title for the /chat route; the root template still
 * appends "· Meepletron" → "Ark Nova | Chat · Meepletron".
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const game = await getGameCached(slug);
  if (!game) return {};
  return {
    title: `${game.title} | Chat`,
    alternates: { canonical: `/boardgames/${slug}/chat` },
  };
}

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
