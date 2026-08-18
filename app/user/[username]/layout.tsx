import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

/**
 * Per-profile metadata so a shared /user/<name> link unfurls with that player's
 * name + avatar (not the generic Meepletron card). Server-side; the page is a
 * client component. Deeper routes (e.g. /user/<name>/<list>) override this.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  try {
    const data = await fetchQuery(api.topGames.publicProfile, { username });
    if (!data) return {};
    const who =
      data.author?.name ??
      (data.author?.username ? `@${data.author.username}` : username);
    const title = `${who} on Meepletron`;
    const listCount = data.lists.length;
    const description =
      listCount > 0
        ? `${who}'s board-game Top ${listCount === 1 ? "list" : "lists"} and collection.`
        : `${who}'s board-game profile.`;
    const image = data.author?.avatarUrl ?? undefined;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "profile",
        ...(image ? { images: [{ url: image }] } : {}),
      },
      twitter: {
        card: "summary",
        title,
        description,
        ...(image ? { images: [image] } : {}),
      },
    };
  } catch {
    return {};
  }
}

export default function UserProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
