"use client";

import {
  Fragment,
  Suspense,
  useCallback,
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
import { stripIconBrackets } from "@/components/chat/GroundedMarkdown";
import { ChatInput } from "@/components/chat/ChatInput";
import { ModelPicker } from "@/components/chat/ModelPicker";
import { RequestRulebookButton } from "@/components/boardgames/RequestRulebookButton";
import { buttonClasses } from "@/components/ui/Button";
import {
  chatModelsForRole,
  isChatModelAllowed,
  DEFAULT_CHAT_MODEL,
} from "@/convex/lib/chatConfig";
import { ResourcesSideNav, LayersIcon } from "@/components/chat/ResourcesSideNav";
import { GuestBanner } from "@/components/chat/GuestBanner";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { BackgroundCover } from "@/components/boardgames/BackgroundCover";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import { Die } from "@/components/ui/icons";
import { useBackNav } from "@/components/ui/BackButton";

const SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL!;

/** Advance an index past the next word + its trailing whitespace, so the smooth
 *  reveal grows one word at a time (keeps citation markers like [2] intact). */
function nextWordEnd(s: string, from: number): number {
  let i = from;
  while (i < s.length && /\s/.test(s[i])) i++; // leading whitespace
  while (i < s.length && !/\s/.test(s[i])) i++; // the word itself
  while (i < s.length && /\s/.test(s[i])) i++; // trailing whitespace
  return i;
}

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

/**
 * The rulebook chat for one game. Used as a full page at
 * /boardgames/[slug]/chat, and — with `embedded` — as the right pane of the
 * desktop two-pane /chats view. `embedded` fills its container (rather than the
 * viewport), drops the standalone chrome (background cover, back button), and
 * skips the URL-deep-link effects (module/q), which only make sense on the route.
 */
export function ChatPane({
  slug,
  embedded = false,
}: {
  slug: string;
  embedded?: boolean;
}) {
  const game = useQuery(api.games.getByHandle, { handle: slug });
  const router = useRouter();

  // One chat per family: an expansion routes to the base game's chat, carrying
  // a `module` param so the expansion's rulebooks get pre-selected there.
  const isExpansion = !!(game && game.isExpansion && game.parent);
  useEffect(() => {
    if (!embedded && game && game.isExpansion && game.parent) {
      router.replace(`/boardgames/${game.parent.slug}/chat?module=${game._id}`);
    }
  }, [game, router, embedded]);

  const loadingCls = embedded
    ? "flex h-full items-center justify-center text-muted"
    : "flex h-dvh items-center justify-center text-muted";

  if (game === undefined || (isExpansion && !embedded)) {
    return <div className={loadingCls}>Loading…</div>;
  }
  if (game === null) {
    return <div className={loadingCls}>Game not found.</div>;
  }
  // Embedded expansions resolve to the base game's chat inline (no navigation).
  const target = embedded && isExpansion && game.parent ? game.parent : game;
  return (
    <Suspense fallback={<div className={loadingCls}>Loading…</div>}>
      <ChatView gameId={target._id} slug={target.slug} embedded={embedded} />
    </Suspense>
  );
}

function ChatView({
  gameId,
  slug,
  embedded,
}: {
  gameId: Id<"games">;
  slug: string;
  embedded: boolean;
}) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const getOrCreateChat = useMutation(api.chat.getOrCreateChat);
  const postMessage = useMutation(api.chat.postMessage);
  const setSelected = useMutation(api.chat.setSelectedRulebooks);
  const addModule = useMutation(api.chat.addModuleRulebooks);
  const token = useAuthToken();
  const router = useRouter();
  const goBack = useBackNav(`/boardgames/${slug}`);
  const searchParams = useSearchParams();
  const moduleParam = searchParams.get("module");
  const qParam = searchParams.get("q");

  const me = useQuery(api.users.me);
  const isGuest = me?.isAnonymous === true;
  const isAdmin = me?.role === "admin";
  const budget = useQuery(api.users.myBudget);

  // Answer-model picker: the models this viewer may choose, their explicit pick
  // (persisted per-browser), and the effective model to send + show. Falls back
  // to the site default (role-adjusted), then a safe non-admin default.
  const modelOptions = useMemo(() => chatModelsForRole(isAdmin), [isAdmin]);
  const modelDefault = useQuery(api.chat.chatModelDefault, {});
  const [pickedModel, setPickedModel] = useState<string | null>(null);
  useEffect(() => {
    // Deferred a frame (localStorage is client-only; keeps SSR + first render
    // identical and avoids a setState-in-effect-body hydration cascade).
    const id = requestAnimationFrame(() => {
      try {
        setPickedModel(localStorage.getItem("meepletron-chat-model"));
      } catch {
        /* storage unavailable */
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);
  // Which models this viewer may actually pick (guests → default only; admin-only
  // → admins). Drives both the picker's enabled state and the fallback below.
  const canUse = useCallback(
    (id: string) => isChatModelAllowed(id, { isAdmin, isGuest }),
    [isAdmin, isGuest],
  );
  // Ignore a stored pick the viewer may no longer use (an admin-only model, or
  // any non-default model once signed out), so the server never has to reject it
  // and the picker never shows a locked model as selected.
  const validPick = pickedModel && canUse(pickedModel) ? pickedModel : null;
  const activeModel =
    validPick ?? modelDefault?.defaultModel ?? DEFAULT_CHAT_MODEL;
  const chooseModel = useCallback((id: string) => {
    setPickedModel(id);
    try {
      localStorage.setItem("meepletron-chat-model", id);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const [chatId, setChatId] = useState<Id<"chats"> | null>(null);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  // Timer for the word-by-word streaming reveal (cleared on unmount).
  const smoothTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (smoothTimerRef.current) clearTimeout(smoothTimerRef.current);
    },
    [],
  );

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
  // The top of the streaming answer — scrolled to the top of the view once, when
  // the answer starts, so the reader begins at the start and the rest writes
  // below (no bottom-chasing). `wasStreamingRef` makes that fire once per answer.
  const answerAnchorRef = useRef<HTMLDivElement>(null);
  const wasStreamingRef = useRef(false);
  const signingIn = useRef(false);
  const moduleApplied = useRef(false);
  const qApplied = useRef(false);
  const pendingQuestionRef = useRef<string | null>(null);

  const ensureGuest = useCallback(() => {
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

  // Pre-select an expansion's modules when arriving via `?module=<expansionId>`.
  // Route-only (deep link); skipped when embedded.
  useEffect(() => {
    if (embedded || !chatId || !moduleParam || moduleApplied.current) return;
    moduleApplied.current = true;
    void addModule({
      chatId,
      moduleGameId: moduleParam as Id<"games">,
    }).finally(() => router.replace(`/boardgames/${slug}/chat`));
  }, [chatId, moduleParam, addModule, router, slug, embedded]);

  // Auto-send a question passed via `?q=` (from the detail page's inline ask).
  // Route-only (deep link); skipped when embedded.
  useEffect(() => {
    if (embedded || qApplied.current || !qParam) return;
    qApplied.current = true;
    askQuestion(qParam);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    const qs = params.toString();
    router.replace(`/boardgames/${slug}/chat${qs ? `?${qs}` : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam]);

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
    } else if (
      lastId !== lastIdRef.current &&
      nearBottomRef.current &&
      // Don't jump to the bottom when the just-sent question lands mid-stream —
      // the answer-anchor effect positions the view instead (reading-first).
      streaming === null
    ) {
      el.scrollTop = el.scrollHeight;
    }
    firstIdRef.current = firstId;
    lastIdRef.current = lastId;
  }, [messages, streaming]);

  // Reading-first: when a new answer starts streaming, scroll its TOP near the
  // top of the view ONCE, then leave the scroll alone (no bottom-chasing) so the
  // reader starts at the beginning and scrolls down at their own pace. Deferred
  // a frame so the just-sent question has rendered first.
  useLayoutEffect(() => {
    if (streaming === null) {
      wasStreamingRef.current = false;
      return;
    }
    if (wasStreamingRef.current) return; // only the first frame of this answer
    wasStreamingRef.current = true;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      const anchor = answerAnchorRef.current;
      if (!el || !anchor) return;
      el.scrollTop = Math.max(
        0,
        el.scrollTop +
          anchor.getBoundingClientRect().top -
          el.getBoundingClientRect().top -
          12,
      );
    });
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

    // Decouple the on-screen reveal from network arrival: the reader accumulates
    // into `buf`, and a steady timer reveals it one word at a time (catching up
    // when the model runs ahead). Gives the smooth typewriter cadence of the
    // landing demo instead of painting ragged network bursts. `reveal` resolves
    // once everything received has been shown, so we finalize after it drains.
    const buf = { text: "", done: false };
    let shown = 0;
    const reveal = new Promise<void>((resolve) => {
      const step = () => {
        const full = buf.text;
        if (shown < full.length) {
          // Reveal more words per tick the further behind we are, so a fast model
          // never leaves the reveal lagging.
          const behind = full.length - shown;
          const perTick = behind > 240 ? 6 : behind > 100 ? 3 : behind > 40 ? 2 : 1;
          for (let i = 0; i < perTick && shown < full.length; i++) {
            shown = nextWordEnd(full, shown);
          }
          setStreaming(full.slice(0, shown));
        }
        if (shown >= full.length && buf.done) {
          resolve();
          return;
        }
        smoothTimerRef.current = setTimeout(step, 56);
      };
      step();
    });

    try {
      const res = await fetch(`${SITE_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chatId, model: activeModel }),
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
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf.text += decoder.decode(value, { stream: true });
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      // Let the reveal drain everything received, then hand off to the saved
      // message so the last words don't get cut as the bubble swaps out.
      buf.done = true;
      await reveal;
      if (smoothTimerRef.current) clearTimeout(smoothTimerRef.current);
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
  // This game family has no ingested rulebook (nothing to chat with). Only once
  // the sources query has resolved — `sources` is undefined while loading.
  const noManual = sources !== undefined && resourceCount === 0;
  const coverUrl = game?.imageUrl ?? game?.thumbnailUrl ?? null;
  // Show the skeleton while auth or the chat itself is still resolving — not just
  // once the first message page is loading. Otherwise, switching chats (which
  // remounts with a null chatId while getOrCreateChat runs) briefly trips the
  // empty state and flashes the cover + suggested questions before messages land.
  // A logged-out route visitor (deferred sign-in) stays unauthenticated with a
  // null chatId, so they still get the welcome immediately.
  const loadingMessages =
    isLoading ||
    (isAuthenticated && !chatId) ||
    (!!chatId && msgStatus === "LoadingFirstPage");
  const isEmpty =
    !loadingMessages && messages.length === 0 && streaming === null;
  const inputReady = !!chatId && !busy;

  // If the visitor asked a suggested question before deferred sign-in finished,
  // send it once the guest chat is ready.
  useEffect(() => {
    if (inputReady && pendingQuestionRef.current) {
      const q = pendingQuestionRef.current;
      pendingQuestionRef.current = null;
      void handleSend(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputReady]);

  function askQuestion(text: string) {
    if (inputReady) {
      void handleSend(text);
    } else {
      ensureGuest();
      pendingQuestionRef.current = text;
    }
  }

  let lastDay: string | null = null;

  return (
    <>
      {!embedded && coverUrl && <BackgroundCover url={coverUrl} />}

      <div className={`flex ${embedded ? "h-full" : "h-dvh"} flex-col`}>
        {/* Game-specific navbar */}
        <header className="shrink-0 border-b border-border bg-background/80 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5">
            {!embedded && (
              <>
                <button
                  type="button"
                  onClick={goBack}
                  aria-label="Go back"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-foreground transition-colors active:bg-surface-2 nav:hidden"
                >
                  <ChevronLeft className="h-6.5 w-6.5" strokeWidth={2.75} />
                </button>
                <button
                  type="button"
                  onClick={goBack}
                  className="hidden shrink-0 items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-foreground nav:inline-flex"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              </>
            )}
            <Link
              href={`/boardgames/${slug}`}
              className="group flex min-w-0 flex-1 items-center gap-2.5"
            >
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-surface-2 shadow-sm">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-subtle">
                    <Die className="h-5 w-5" />
                  </div>
                )}
              </div>
              <h1 className="font-display truncate font-bold transition-colors group-hover:text-accent">
                {game?.title ?? "Game"}
              </h1>
            </Link>
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
            data-lenis-prevent
            className="chat-scroll flex-1 space-y-4 overflow-y-auto py-4"
          >
          {msgStatus === "LoadingMore" && (
            <p className="py-2 text-center text-xs text-muted">
              Loading earlier messages…
            </p>
          )}
          {loadingMessages && <MessagesSkeleton />}
          {isEmpty && (
            <div className="animate-in flex flex-col items-center gap-4 rounded-xl border border-dashed border-border p-6 text-center">
              <div className="h-24 w-24 overflow-hidden rounded-xl border border-border bg-surface-2">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrl}
                    alt={game?.title ?? "Game cover"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-subtle">
                    <Die className="h-9 w-9" />
                  </div>
                )}
              </div>
              <div>
                <p className="font-display text-lg font-bold">
                  {noManual
                    ? "No rulebook yet"
                    : `Ask about ${game?.title ?? "this game"}`}
                </p>
                <p className="text-sm text-muted">
                  {noManual
                    ? `We don't have ${game?.title ?? "this game"}'s rulebook in Meepletron yet, so there's nothing to chat with. Request it below and we'll add it.`
                    : "Tap a question to get started, or type your own."}
                </p>
              </div>
              {!noManual && (
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => askQuestion(q)}
                      disabled={busy}
                      className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm transition-colors hover:bg-surface-2 disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
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
                {isAdmin &&
                  m.role === "assistant" &&
                  ((m.inputTokens ?? 0) > 0 || (m.outputTokens ?? 0) > 0) && (
                    <p className="mt-0.5 pl-1 text-[10px] text-subtle">
                      {(m.inputTokens ?? 0).toLocaleString()} in ·{" "}
                      {(m.outputTokens ?? 0).toLocaleString()} out ·{" "}
                      {((m.inputTokens ?? 0) + (m.outputTokens ?? 0)).toLocaleString()}{" "}
                      total · ~$
                      {(
                        // Use the stored per-model cost; fall back to the old
                        // flat flash rate only for messages saved before it.
                        m.costUsd ??
                        ((m.inputTokens ?? 0) * 0.3 +
                          (m.outputTokens ?? 0) * 2.5) /
                          1e6
                      ).toFixed(4)}
                      {m.answerModel &&
                        ` · ${m.answerModel.replace(/^(gemini|claude)-/, "")}`}
                    </p>
                  )}
              </Fragment>
            );
          })}
          {streaming !== null && (
            <div className="msg-in flex flex-col items-start">
              {/* Marks the top of the answer; the reading-first effect scrolls
                  this to the top of the view when the answer begins. */}
              <div ref={answerAnchorRef} aria-hidden className="h-0 w-0" />
              <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-border bg-surface px-4 py-3 text-sm leading-relaxed">
                {streaming ? (
                  <span className="whitespace-pre-wrap">
                    {stripIconBrackets(streaming)}
                    <span className="ml-0.5 inline-block h-[1.05em] w-0.5 animate-pulse bg-accent align-text-bottom" />
                  </span>
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
            {noManual ? (
              // Nothing to chat with — gate the input behind the normal rulebook
              // request flow (RequestRulebookButton = deduped per user, surfaces
              // in the admin Requests tab, emails the user when it's ready).
              <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-center">
                <p className="text-sm text-muted">
                  This game doesn&apos;t have a rulebook yet.
                </p>
                <RequestRulebookButton
                  gameId={gameId}
                  className={buttonClasses("primary", "md")}
                />
              </div>
            ) : (
              <>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <ModelPicker
                    models={modelOptions}
                    value={activeModel}
                    onChange={chooseModel}
                    isEnabled={canUse}
                    disabled={busy}
                  />
                  {budget && (
                    <p
                      className={`shrink-0 pr-1 text-right text-[11px] font-medium ${
                        !budget.unlimited && budget.remaining <= 5000
                          ? "text-red-500"
                          : "text-subtle"
                      }`}
                    >
                      {budget.unlimited
                        ? "No limit"
                        : `${budget.remaining.toLocaleString()} tokens left today`}
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
                </div>
                <ChatInput
                  onSend={handleSend}
                  disabled={!inputReady}
                  onFocus={ensureGuest}
                />
              </>
            )}
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
