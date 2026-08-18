import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

const LABELS: Record<string, string> = {
  owned: "Owned games",
  "for-trade": "Games for trade",
  wishlist: "Wishlist",
};

/**
 * Per-collection-list metadata so a shared /user/<name>/<list> link unfurls with
 * that player + which list (owned / for trade / wishlist), not the generic card.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; list: string }>;
}): Promise<Metadata> {
  const { username, list } = await params;
  const label = LABELS[list];
  if (!label) return {};
  const valid = list === "owned" || list === "for-trade" || list === "wishlist";
  try {
    const meta = valid
      ? await fetchQuery(api.topGames.publicCollectionMeta, {
          username,
          list: list as "owned" | "for-trade" | "wishlist",
        })
      : null;
    const who =
      meta?.author?.name ??
      (meta?.author?.username ? `@${meta.author.username}` : username);
    const title = `${who}'s ${label}`;
    const description = `${who}'s ${label.toLowerCase()} on Meepletron.`;
    return {
      title,
      description,
      openGraph: { title: `${title} · Meepletron`, description, type: "website" },
      twitter: { card: "summary", title: `${title} · Meepletron`, description },
    };
  } catch {
    return {};
  }
}

export default function CollectionListLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
