import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

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
  const game = await fetchQuery(api.games.getByHandle, { handle: slug }).catch(
    () => null,
  );
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
