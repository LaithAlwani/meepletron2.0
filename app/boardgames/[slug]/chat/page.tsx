"use client";

import {
  Fragment,
  Suspense,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useQuery,
  useMutation,
  usePaginatedQuery,
  useConvexAuth,
} from "convex/react";
import { useAuthToken, useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { dayLabel } from "@/lib/format";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ChatInput } from "@/components/chat/ChatInput";
import { ResourcesSideNav, LayersIcon } from "@/components/chat/ResourcesSideNav";
import { GuestBanner } from "@/components/chat/GuestBanner";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { BackgroundCover } from "@/components/boardgames/BackgroundCover";
import { ThemeToggle } from "@/components/ThemeToggle";

const SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL!;

const BackIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
);

const SKELETON_ROWS: { side: "l" | "r"; w: string }[] = [
  { side: "l", w: "w-64" },
  { side: "r", w: "w-40" },
  { side: "l", w: "w-72" },
  { side: "r", w: "w-52" },
  { side: "l", w: "w-56" },
];

function MessagesSkeleton() {
  return (
    <div className="space-y-4">
      {SKELETON_ROWS.map((r, i) => (
        <div
          key={i}
          className={r.side === "r" ? "flex justify-end" : "flex justify-start"}
        >
          <div
            className={`h-14 max-w-[80%] animate-pulse rounded-2xl bg-surface-2 ${r.w}`}
          />
        </div>
      ))}
    </div>
  );
}

const SUGGESTED_QUESTIONS = [
  "How do I set up the game?",
  "What can I do on my turn?",
  "How do I win?",
  "How does scoring work?",
];

export default function ChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: handle } = use(params);
  const game = useQuery(api.games.getByHandle, { handle });
  const router = useRouter();

  // One chat per family: an expansion routes to the base game's chat, carrying
  // a `module` param so the expansion's rulebooks get pre-selected there.
  const isExpansion = !!(game && game.isExpansion && game.parent);
  useEffect(() => {
    if (game && game.isExpansion && game.parent) {
      router.replace(
        `/boardgames/${game.parent.slug}/chat?module=${game._id}`,
      );
    }
  }, [game, router]);

  if (game === undefined || isExpansion) {
    return (
      <div className="flex h-dvh items-center justify-center text-muted">
        Loading…
      </div>
    );
  }
  if (game === null) {
    return (
      <div className="flex h-dvh items-center justify-center text-muted">
        Game not found.
      </div>
    );
  }
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center text-muted">
          Loading…
        </div>
      }
    >
      <ChatView gameId={game._id} slug={game.slug} />
    </Suspense>
  );
}

function ChatView({ gameId, slug }: { gameId: Id<"games">; slug: string }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const getOrCreateChat = useMutation(api.chat.getOrCreateChat);
  const postMessage = useMutation(api.chat.postMessage);
  const setSelected = useMutation(api.chat.setSelectedRulebooks);
  const addModule = useMutation(api.chat.addModuleRulebooks);
  const token = useAuthToken();
  const router = useRouter();
  const searchParams = useSearchParams();
  const moduleParam = searchParams.get("module");

  const me = useQuery(api.users.me);
  const isGuest = me?.isAnonymous === true;
  const budget = useQuery(api.users.myBudget);

  const [chatId, setChatId] = useState<Id<"chats"> | null>(null);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resourcesOpen, setResourcesOpen] = useState(false);

  const game = useQuery(api.games.getById, { gameId });
  const sources = useQuery(api.games.chatSources, { gameId });
  const chat = useQuery(api.chat.getChat, chatId ? { chatId } : "skip");
  const {
    results: pagedMessages,
    status: msgStatus,
    loadMore: loadMoreMessages,
  } = usePaginatedQuery(
    api.chat.messagesPaginated,
    chatId ? { chatId } : "skip",
    { initialNumItems: 10 },
  );
  // Server returns newest-first; reverse to oldest→newest for display.
  const messages = useMemo(() => [...pagedMessages].reverse(), [pagedMessages]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const firstIdRef = useRef<string | null>(null);
  const lastIdRef = useRef<string | null>(null);
  const restoreRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(
    null,
  );
  const nearBottomRef = useRef(true);
  const signingIn = useRef(false);
  const moduleApplied = useRef(false);

  // Brand-new visitors get an anonymous identity automatically so they can
  // chat right away (and their daily budget is enforced server-side).
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !signingIn.current) {
      signingIn.current = true;
      void signIn("anonymous").finally(() => {
        signingIn.current = false;
      });
    }
  }, [isLoading, isAuthenticated, signIn]);

  // Once authenticated (real or guest), open/create the chat for this game.
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    getOrCreateChat({ gameId }).then((id) => {
      if (active) setChatId(id);
    });
    return () => {
      active = false;
    };
  }, [isAuthenticated, gameId, getOrCreateChat]);

  // Pre-select an expansion's modules when arriving via `?module=<expansionId>`
  // (from an expansion's Chat button), then drop the param so a refresh won't
  // re-apply it. Non-destructive — it unions into the existing selection.
  useEffect(() => {
    if (!chatId || !moduleParam || moduleApplied.current) return;
    moduleApplied.current = true;
    void addModule({
      chatId,
      moduleGameId: moduleParam as Id<"games">,
    }).finally(() => router.replace(`/boardgames/${slug}/chat`));
  }, [chatId, moduleParam, addModule, router, slug]);

  // Reset scroll bookkeeping when switching chats.
  useEffect(() => {
    initializedRef.current = false;
    firstIdRef.current = null;
    lastIdRef.current = null;
    nearBottomRef.current = true;
  }, [chatId]);

  // Anchor to bottom on first load; preserve position when older messages are
  // prepended; auto-scroll on new messages only if already near the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0) return;
    const firstId = messages[0]._id;
    const lastId = messages[messages.length - 1]._id;

    if (!initializedRef.current) {
      el.scrollTop = el.scrollHeight; // start at the last message, no animation
      initializedRef.current = true;
    } else if (restoreRef.current && firstId !== firstIdRef.current) {
      const prev = restoreRef.current;
      el.scrollTop = el.scrollHeight - prev.scrollHeight + prev.scrollTop;
      restoreRef.current = null;
    } else if (lastId !== lastIdRef.current && nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    firstIdRef.current = firstId;
    lastIdRef.current = lastId;
  }, [messages]);

  // Keep pinned to the bottom while streaming, if the user is near the bottom.
  useLayoutEffect(() => {
    if (streaming === null || !nearBottomRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streaming]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    // Near the top → load older messages, preserving scroll position.
    if (el.scrollTop < 80 && msgStatus === "CanLoadMore" && !restoreRef.current) {
      restoreRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
      loadMoreMessages(10);
    }
  }

  async function handleSend(text: string) {
    if (!chatId || busy) return;
    setError(null);
    nearBottomRef.current = true;
    await postMessage({ chatId, content: text });
    setBusy(true);
    setStreaming("");
    try {
      const res = await fetch(`${SITE_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chatId }),
      });
      if (!res.ok || !res.body) {
        setError(
          res.status === 429
            ? isGuest
              ? "You've used today's guest limit (20K tokens). Sign in to get 50K per day."
              : "You've reached today's message limit. Try again tomorrow."
            : "Something went wrong. Please try again.",
        );
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setStreaming(acc);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setStreaming(null);
      setBusy(false);
    }
  }

  function toggleSource(rulebookId: Id<"rulebooks">, next: boolean) {
    if (!chatId || !chat) return;
    const set = new Set(chat.selectedRulebookIds);
    if (next) set.add(rulebookId);
    else set.delete(rulebookId);
    void setSelected({ chatId, rulebookIds: [...set] });
  }

  const groups = useMemo(() => sources ?? [], [sources]);
  const resourceCount = groups.reduce((n, g) => n + g.rulebooks.length, 0);
  const coverUrl = game?.imageUrl ?? game?.thumbnailUrl ?? null;
  const loadingMessages = msgStatus === "LoadingFirstPage";
  const isEmpty =
    !loadingMessages && messages.length === 0 && streaming === null;
  const inputReady = !!chatId && !busy;

  let lastDay: string | null = null;

  return (
    <>
      {coverUrl && <BackgroundCover url={coverUrl} />}

      <div className="flex h-dvh flex-col">
        {/* Game-specific navbar */}
        <header className="shrink-0 border-b border-border bg-background/80 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5">
            <Link
              href={`/boardgames/${slug}`}
              aria-label="Back to game"
              className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              {BackIcon}
            </Link>
            <Link
              href={`/boardgames/${slug}`}
              className="group flex min-w-0 flex-1 items-center gap-2.5"
            >
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-surface-2 shadow-sm">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">🎲</div>
                )}
              </div>
              <h1 className="truncate font-semibold transition-colors group-hover:text-accent">
                {game?.title ?? "Game"}
              </h1>
            </Link>
            <ThemeToggle />
            <button
              onClick={() => setResourcesOpen(true)}
              aria-label={`Open resources (${resourceCount} available)`}
              className="flex shrink-0 flex-col items-center gap-0.5 rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <span className="relative">
                {LayersIcon}
                {resourceCount > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-accent-foreground">
                    {resourceCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium leading-none">Resources</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4">
          {isGuest && (
            <div className="pt-3">
              <GuestBanner />
            </div>
          )}

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="chat-scroll flex-1 space-y-4 overflow-y-auto py-4"
          >
          {msgStatus === "LoadingMore" && (
            <p className="py-2 text-center text-xs text-muted">
              Loading earlier messages…
            </p>
          )}
          {loadingMessages && <MessagesSkeleton />}
          {isEmpty && (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border p-6 text-center">
              <div className="h-24 w-24 overflow-hidden rounded-xl border border-border bg-surface-2">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrl}
                    alt={game?.title ?? "Game cover"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-4xl opacity-40">
                    🎲
                  </div>
                )}
              </div>
              <div>
                <p className="font-semibold">
                  Ask about {game?.title ?? "this game"}
                </p>
                <p className="text-sm text-muted">
                  Tap a question to get started, or type your own.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    disabled={!inputReady}
                    className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm transition-colors hover:bg-surface-2 disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => {
            const label = dayLabel(m._creationTime);
            const showSeparator = label !== lastDay;
            lastDay = label;
            return (
              <Fragment key={m._id}>
                {showSeparator && (
                  <div className="flex justify-center py-1">
                    <span className="rounded-full bg-surface-2 px-3 py-0.5 text-xs text-muted">
                      {label}
                    </span>
                  </div>
                )}
                <MessageBubble message={m} />
              </Fragment>
            );
          })}
          {streaming !== null && (
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-border bg-surface px-4 py-3 text-sm leading-relaxed">
                {streaming ? (
                  <span className="whitespace-pre-wrap">{streaming}</span>
                ) : (
                  <ThinkingIndicator />
                )}
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mb-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

          <div className="shrink-0 bg-background pb-4 pt-2">
            {budget && (
              <p
                className={`mb-1 pr-1 text-right text-[11px] font-medium ${
                  budget.remaining <= 5000 ? "text-red-500" : "text-subtle"
                }`}
              >
                {budget.remaining.toLocaleString()} tokens left today
                {budget.isGuest && (
                  <>
                    {" · "}
                    <Link href="/auth" className="text-accent hover:underline">
                      Sign in for more
                    </Link>
                  </>
                )}
              </p>
            )}
            <ChatInput onSend={handleSend} disabled={!inputReady} />
          </div>
        </div>
      </div>

      <ResourcesSideNav
        open={resourcesOpen}
        onClose={() => setResourcesOpen(false)}
        groups={groups}
        selectedIds={chat?.selectedRulebookIds ?? []}
        onToggle={toggleSource}
      />
    </>
  );
}
