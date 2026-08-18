import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { topListTitle } from "@/lib/topGamesTitle";

/**
 * Per-list metadata so a shared Top Games link unfurls with the list's own title
 * and author (not the generic Meepletron card). Server-side; the page itself is a
 * client component.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ listId: string }>;
}): Promise<Metadata> {
  const { listId } = await params;
  try {
    const list = await fetchQuery(api.topGames.getList, {
      id: listId as Id<"topGamesLists">,
    });
    if (!list) return {};
    const displayTitle = topListTitle(list.size, list.year, list.title);
    const who =
      list.author?.name ??
      (list.author?.username ? `@${list.author.username}` : null);
    const title = who ? `${displayTitle} — ${who}` : displayTitle;
    const description = who
      ? `${who}'s ranked top ${list.size} board games of ${list.year}.`
      : `A ranked top ${list.size} board games of ${list.year}.`;
    return {
      title,
      description,
      openGraph: {
        title: `${title} · Meepletron`,
        description,
        type: "website",
      },
      twitter: { card: "summary", title: `${title} · Meepletron`, description },
    };
  } catch {
    return {};
  }
}

export default function TopListLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
