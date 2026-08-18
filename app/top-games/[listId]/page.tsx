"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Lock } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TopGamesEditor } from "@/components/top-games/TopGamesEditor";
import { TopGamesView, type TopListData } from "@/components/top-games/TopGamesView";
import { Skeleton } from "@/components/ui/Surface";
import { buttonClasses } from "@/components/ui/Button";

export default function TopListPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = use(params);
  const id = listId as Id<"topGamesLists">;
  const data = useQuery(api.topGames.getList, { id });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {data === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : data === null ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          <Lock className="mx-auto h-8 w-8 text-subtle" />
          <p className="mt-3 font-medium">This list is private or doesn&apos;t exist.</p>
          <Link href="/top-games" className={`mt-4 ${buttonClasses("ghost", "sm")}`}>
            Back to Top Games
          </Link>
        </div>
      ) : data.isOwner && data.status === "draft" ? (
        <>
          <Link
            href="/top-games"
            className="mb-4 inline-block text-sm font-medium text-muted hover:text-foreground"
          >
            ← All lists
          </Link>
          <TopGamesEditor
            listId={data._id}
            category={data.category}
            size={data.size}
            year={data.year}
            title={data.title}
            items={data.items}
          />
        </>
      ) : (
        <>
          <Link
            href="/top-games"
            className="mb-4 inline-block text-sm font-medium text-muted hover:text-foreground"
          >
            ← All lists
          </Link>
          <TopGamesView data={data as TopListData} />
        </>
      )}
    </div>
  );
}
