import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Per-post metadata so a shared post link unfurls with its own title, author, and
 * image. Server-side; the page itself is a client component. Private/missing
 * posts fall back to nothing (no unfurl).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ postId: string }>;
}): Promise<Metadata> {
  const { postId } = await params;
  try {
    const post = await fetchQuery(api.posts.getPost, {
      postId: postId as Id<"posts">,
    });
    if (!post) return {};
    const author = post.owner.name;
    let title: string;
    let description: string;
    if (post.kind === "play") {
      title = `${post.title} — a play by ${author}`;
      description =
        post.caption ?? `A board-game play shared by ${author} on Meepletron.`;
    } else if (post.kind === "toplist") {
      title = `${post.listTitle ?? "Top Games"} — ${author}`;
      description = post.caption ?? `${author}'s Top Games list on Meepletron.`;
    } else {
      title = `${author} shared photos`;
      description =
        post.caption ?? `Photos from ${author}'s game night on Meepletron.`;
    }
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

export default function PostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
