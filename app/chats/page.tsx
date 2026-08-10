"use client";

import Link from "next/link";
import {
  useQuery,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { ChevronRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { MediaRow } from "@/components/boardgames/MediaRow";
import { relativeTime } from "@/lib/format";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Surface";

export default function ChatsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display mb-5 text-3xl font-extrabold tracking-tight">
        Your chats
      </h1>
      <AuthLoading>
        <ChatsSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">
            Sign in to see your rulebook chats.
          </p>
          <Link href="/auth" className={`mt-4 ${buttonClasses("primary", "sm")}`}>
            Sign in
          </Link>
        </div>
      </Unauthenticated>
      <Authenticated>
        <ChatsList />
      </Authenticated>
    </div>
  );
}

function ChatsSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
        >
          <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ChatsList() {
  const chats = useQuery(api.chat.listMyChats);

  if (chats === undefined) return <ChatsSkeleton />;

  if (chats.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
        <p className="font-medium">No chats yet.</p>
        <Link
          href="/boardgames"
          className="mt-2 inline-block font-semibold text-accent hover:underline"
        >
          Browse games to start one
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {chats.map((c) => (
        <MediaRow
          key={c._id}
          href={c.gameSlug ? `/boardgames/${c.gameSlug}/chat` : undefined}
          dimmed={!c.gameSlug}
          thumbUrl={c.thumbnailUrl}
          title={c.gameTitle}
          subtitle={c.lastMessage}
          meta={relativeTime(c.lastMessageAt)}
          trailing={
            c.gameSlug ? (
              <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
            ) : undefined
          }
        />
      ))}
    </ul>
  );
}
