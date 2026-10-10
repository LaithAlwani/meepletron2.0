"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useQuery,
  useMutation,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { ChevronRight, MessageCircle, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MediaRow } from "@/components/boardgames/MediaRow";
import { relativeTime } from "@/lib/format";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Surface";
import { PageTitle } from "@/components/ui/PageTitle";
import { Die } from "@/components/ui/icons";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/ui/Toast";
import { friendlyError } from "@/lib/friendlyError";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { ChatPane } from "@/components/chat/ChatPane";

/** Confirm + delete one chat; returns whether it was actually deleted. */
function useDeleteChat() {
  const del = useMutation(api.chat.deleteChat);
  const confirm = useConfirm();
  const toast = useToast();
  return async (chatId: Id<"chats">, title: string): Promise<boolean> => {
    const ok = await confirm({
      title: "Delete this chat?",
      message: `This permanently deletes your chat about ${title} and all its messages. This can't be undone.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return false;
    try {
      await del({ chatId });
      toast("Chat deleted", "success");
      return true;
    } catch (e) {
      toast(friendlyError(e, "Couldn't delete the chat"), "error");
      return false;
    }
  };
}

function Narrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-site px-4 pb-8 pt-3 nav:pt-8">
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
  const deleteChat = useDeleteChat();

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
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                onClick={() => deleteChat(c._id, c.gameTitle)}
                aria-label={`Delete chat about ${c.gameTitle}`}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-2 hover:text-red-500 dark:hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              {c.gameSlug && (
                <ChevronRight className="h-4 w-4 text-subtle" />
              )}
            </div>
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
  const deleteChat = useDeleteChat();

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
        <div data-lenis-prevent className="flex-1 overflow-y-auto p-2">
          {chats.map((c) => {
            const active = !!c.gameSlug && c.gameSlug === activeSlug;
            return (
              <div
                key={c._id}
                className={`group flex items-center rounded-xl transition-colors ${
                  active ? "bg-accent/10" : "hover:bg-surface-2"
                } ${!c.gameSlug ? "opacity-60" : ""}`}
              >
                <button
                  onClick={() => c.gameSlug && setSelected(c.gameSlug)}
                  disabled={!c.gameSlug}
                  className={`flex min-w-0 flex-1 items-center gap-3 p-2 text-left ${
                    !c.gameSlug ? "cursor-default" : ""
                  }`}
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
                <button
                  onClick={async () => {
                    const wasActive = c.gameSlug === selected;
                    const gone = await deleteChat(c._id, c.gameTitle);
                    // If the open chat was deleted, fall back to the newest one.
                    if (gone && wasActive) setSelected(null);
                  }}
                  aria-label={`Delete chat about ${c.gameTitle}`}
                  className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-subtle opacity-0 transition-opacity hover:bg-surface-2 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
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
