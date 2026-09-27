"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useQuery,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { ChevronRight, MessageCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { MediaRow } from "@/components/boardgames/MediaRow";
import { relativeTime } from "@/lib/format";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Surface";
import { PageTitle } from "@/components/ui/PageTitle";
import { Die } from "@/components/ui/icons";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { ChatPane } from "@/components/chat/ChatPane";

function Narrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-8 pt-3 nav:pt-8">
      <PageTitle className="mb-5 hidden nav:block">Chats</PageTitle>
      {children}
    </div>
  );
}

export default function ChatsPage() {
  // The desktop two-pane needs the wider (867px) nav layout; below that, the
  // simple list (tapping a chat opens its full page).
  const isDesktop = useMediaQuery("(min-width: 867px)");
  return (
    <>
      <AuthLoading>
        <Narrow>
          <ChatsSkeleton />
        </Narrow>
      </AuthLoading>
      <Unauthenticated>
        <Narrow>
          <div className="rounded-2xl border border-border bg-surface p-6 text-center">
            <p className="text-sm text-muted">
              Sign in to see your rulebook chats.
            </p>
            <Link
              href="/auth"
              className={`mt-4 ${buttonClasses("primary", "sm")}`}
            >
              Sign in
            </Link>
          </div>
        </Narrow>
      </Unauthenticated>
      <Authenticated>
        {isDesktop ? (
          <TwoPane />
        ) : (
          <Narrow>
            <ChatsList />
          </Narrow>
        )}
      </Authenticated>
    </>
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

/** Mobile / narrow: a simple list; each row opens the game's full chat page. */
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

/** Desktop: WhatsApp-style two-pane — chat list on the left, the chat on the right. */
function TwoPane() {
  const chats = useQuery(api.chat.listMyChats);
  const [selected, setSelected] = useState<string | null>(null);

  // Fill the viewport below the sticky desktop header.
  const heightCls = "h-[calc(100dvh-3.75rem)]";

  if (chats === undefined) {
    return (
      <div className={`flex ${heightCls} items-center justify-center text-muted`}>
        Loading…
      </div>
    );
  }
  if (chats.length === 0) {
    return (
      <div
        className={`flex ${heightCls} flex-col items-center justify-center gap-2 text-center text-muted`}
      >
        <MessageCircle className="h-8 w-8 text-subtle" />
        <p className="font-medium">No chats yet.</p>
        <Link
          href="/boardgames"
          className="font-semibold text-accent hover:underline"
        >
          Browse games to start one
        </Link>
      </div>
    );
  }

  // Default to the most recent chat until the user picks another.
  const activeSlug =
    selected ?? chats.find((c) => c.gameSlug)?.gameSlug ?? null;

  return (
    <div className={`flex ${heightCls}`}>
      {/* Chat list */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-border">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <p className="font-display text-lg font-bold">Chats</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {chats.map((c) => {
            const active = !!c.gameSlug && c.gameSlug === activeSlug;
            return (
              <button
                key={c._id}
                onClick={() => c.gameSlug && setSelected(c.gameSlug)}
                disabled={!c.gameSlug}
                className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors ${
                  active ? "bg-accent/10" : "hover:bg-surface-2"
                } ${!c.gameSlug ? "cursor-default opacity-60" : ""}`}
              >
                <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {c.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-subtle">
                      <Die className="h-5 w-5" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">
                      {c.gameTitle}
                    </span>
                    <span className="shrink-0 text-[11px] text-subtle">
                      {relativeTime(c.lastMessageAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {c.lastMessage}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Chat window */}
      <div className="min-w-0 flex-1">
        {activeSlug ? (
          <ChatPane key={activeSlug} slug={activeSlug} embedded />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            Select a chat
          </div>
        )}
      </div>
    </div>
  );
}
