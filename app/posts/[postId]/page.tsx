"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PostFeedItem } from "@/components/plays/PostFeedItem";
import { Skeleton } from "@/components/ui/Surface";

export default function PostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = use(params);
  const post = useQuery(api.posts.getPost, { postId: postId as Id<"posts"> });

  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:py-8">
      <Link
        href="/feed"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Home
      </Link>
      {post === undefined ? (
        <Skeleton className="h-72 w-full rounded-2xl" />
      ) : post === null ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <p className="font-medium">This post is private or doesn&apos;t exist.</p>
        </div>
      ) : (
        <PostFeedItem item={post} />
      )}
    </div>
  );
}
