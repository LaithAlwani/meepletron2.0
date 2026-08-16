"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useQuery, useMutation, useAction, useConvexAuth } from "convex/react";
import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { Bot, Sparkles, X, ExternalLink } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { stripIconBrackets } from "@/components/chat/MessageBubble";
import { ChatInput } from "@/components/chat/ChatInput";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { Die } from "@/components/ui/icons";

const SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

type ActiveGame = { _id: Id<"games">; slug: string; title: string; cover: string | null };
type Candidate = {
  _id: Id<"games">;
  slug: string;
  title: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  hasRulebooks: boolean;
};
type Item =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "note"; text: string }
  | { kind: "context"; game: { title: string; cover: string | null } | null }
  | { kind: "candidates"; candidates: Candidate[]; question: string };

/** Strip icon tokens + inline [n] citation markers for the compact bubble view. */
function cleanAnswer(s: string): string {
  return stripIconBrackets(s).replace(/\s?\[\d+\]/g, "");
}

export function GlobalAssistant() {
  const pathname = usePathname() ?? "";
  const hidden =
    pathname === "/" ||
    pathname === "/auth" ||
    pathname === "/who-goes-first" ||
    /^\/boardgames\/[^/]+\/chat/.test(pathname);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"general" | "game">("general");
  const [activeGame, setActiveGame] = useState<ActiveGame | null>(null);
  const [chatId, setChatId] = useState<Id<"chats"> | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generalHistory = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const pending = useRef<string | null>(null);

  const budget = useQuery(api.users.myBudget);
  const { isLoading, isAuthenticated } = useConvexAuth();
  const token = useAuthToken();
  const { signIn } = useAuthActions();
  const signingIn = useRef(false);

  const route = useAction(api.assistant.route);
  const getOrCreateChat = useMutation(api.chat.getOrCreateChat);
  const postMessage = useMutation(api.chat.postMessage);

  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, streaming, open]);

  // Body scroll lock while the panel is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const inputReady = isAuthenticated && !!token;

  const ensureGuest = useCallback(() => {
    if (!isLoading && !isAuthenticated && !signingIn.current) {
      signingIn.current = true;
      void signIn("anonymous").finally(() => {
        signingIn.current = false;
      });
    }
  }, [isLoading, isAuthenticated, signIn]);

  const push = useCallback((item: Item) => setItems((prev) => [...prev, item]), []);

  /** Stream a plaintext answer from a Convex HTTP action into the live bubble. */
  const streamFrom = useCallback(
    async (path: string, body: unknown): Promise<string | null> => {
      try {
        const res = await fetch(`${SITE_URL}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok || !res.body) {
          push({
            kind: "note",
            text:
              res.status === 429
                ? "You've reached today's message limit. Try again tomorrow."
                : "Something went wrong. Please try again.",
          });
          return null;
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
        return acc;
      } catch {
        push({ kind: "note", text: "Network error. Please try again." });
        return null;
      }
    },
    [token, push],
  );

  const answerGame = useCallback(
    async (id: Id<"chats">, question: string) => {
      await postMessage({ chatId: id, content: question });
      setStreaming("");
      const full = await streamFrom("/chat", { chatId: id });
      setStreaming(null);
      if (full) push({ kind: "assistant", text: full });
    },
    [postMessage, streamFrom, push],
  );

  const answerGeneral = useCallback(
    async (question: string) => {
      if (mode !== "general") push({ kind: "context", game: null });
      setMode("general");
      generalHistory.current.push({ role: "user", content: question });
      setStreaming("");
      const full = await streamFrom("/assistant", {
        messages: generalHistory.current.slice(-12),
      });
      setStreaming(null);
      if (full) {
        generalHistory.current.push({ role: "assistant", content: full });
        push({ kind: "assistant", text: full });
      }
    },
    [mode, streamFrom, push],
  );

  const startGame = useCallback(
    async (c: Candidate, question: string) => {
      if (!c.hasRulebooks) {
        push({
          kind: "note",
          text: `I found ${c.title}, but its rulebook hasn't been added to Meepletron yet — so I can't answer rules questions about it.`,
        });
        return;
      }
      const cover = c.thumbnailUrl ?? c.imageUrl ?? null;
      setActiveGame({ _id: c._id, slug: c.slug, title: c.title, cover });
      setMode("game");
      push({ kind: "context", game: { title: c.title, cover } });
      const id = await getOrCreateChat({ gameId: c._id, selectAllFamily: true });
      setChatId(id);
      await answerGame(id, question);
    },
    [getOrCreateChat, answerGame, push],
  );

  const process = useCallback(
    async (text: string) => {
      setBusy(true);
      try {
        const result = await route({
          text,
          currentGameId: mode === "game" ? activeGame?._id : undefined,
        });
        if (result.mode === "general") {
          await answerGeneral(text);
        } else if (result.mode === "current" && activeGame && chatId) {
          await answerGame(chatId, text);
        } else {
          // switch — never auto-switch; the user confirms by tapping a cover.
          const cands = result.candidates;
          if (cands.length === 0) {
            push({
              kind: "note",
              text: result.gameName
                ? `I don't have "${result.gameName}" in the library yet.`
                : "Which game would you like to ask about? Just tell me its name.",
            });
          } else {
            push({ kind: "candidates", candidates: cands, question: text });
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [route, mode, activeGame, chatId, answerGeneral, answerGame, push],
  );

  // Flush a queued message once auth (guest) is ready.
  useEffect(() => {
    if (inputReady && pending.current && !busy) {
      const q = pending.current;
      pending.current = null;
      void process(q);
    }
  }, [inputReady, busy, process]);

  function send(text: string) {
    push({ kind: "user", text });
    if (!inputReady) {
      pending.current = text;
      ensureGuest();
      return;
    }
    void process(text);
  }

  function pickCandidate(c: Candidate, question: string) {
    if (busy) return;
    // Replace the candidates item with a note-free flow: just start the game.
    setItems((prev) => prev.filter((it) => it.kind !== "candidates"));
    setBusy(true);
    void startGame(c, question).finally(() => setBusy(false));
  }

  if (hidden) return null;

  const remaining = budget?.remaining;

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open the assistant"
          className="fixed bottom-[calc(3.75rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg ring-1 ring-black/10 transition-transform hover:scale-105 active:scale-95 sm:bottom-6"
        >
          <Bot className="h-6 w-6" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <>
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-[1px]"
          />
          <div className="animate-in fixed bottom-0 left-0 z-50 flex h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:bottom-6 sm:left-auto sm:right-4 sm:h-128 sm:w-96 sm:rounded-2xl">
            {/* Header — current context */}
            <div className="flex items-center gap-2.5 border-b border-border bg-surface px-3 py-2.5">
              {mode === "game" && activeGame ? (
                <>
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                    {activeGame.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeGame.cover}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-subtle">
                        <Die className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display truncate text-sm font-bold leading-tight">
                      {activeGame.title}
                    </p>
                    <Link
                      href={`/boardgames/${activeGame.slug}/chat`}
                      className="inline-flex items-center gap-0.5 text-[11px] text-muted hover:text-accent"
                    >
                      Open full chat
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
                    <Sparkles className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display truncate text-sm font-bold leading-tight">
                      General
                    </p>
                    <p className="text-[11px] text-muted">Ask about Meepletron</p>
                  </div>
                </>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Transcript */}
            <div
              ref={scrollRef}
              className="themed-scroll flex-1 space-y-3 overflow-y-auto px-3 py-3"
            >
              {items.length === 0 && (
                <div className="mt-6 text-center text-sm text-muted">
                  <p className="font-medium text-foreground">
                    Hi! I&apos;m your board-game assistant.
                  </p>
                  <p className="mt-1">
                    Name a game to ask about its rules — like{" "}
                    <span className="text-accent">&ldquo;how does Root
                    combat work?&rdquo;</span> — or ask me about Meepletron.
                  </p>
                </div>
              )}

              {items.map((it, i) => {
                if (it.kind === "user") {
                  return (
                    <div key={i} className="msg-in flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-sm text-accent-foreground">
                        {it.text}
                      </div>
                    </div>
                  );
                }
                if (it.kind === "assistant") {
                  return (
                    <div key={i} className="msg-in flex justify-start">
                      <div className="prose-chat max-w-[92%] rounded-2xl rounded-bl-sm border border-border bg-surface px-3.5 py-2.5 text-sm">
                        <ReactMarkdown>{cleanAnswer(it.text)}</ReactMarkdown>
                      </div>
                    </div>
                  );
                }
                if (it.kind === "note") {
                  return (
                    <p key={i} className="px-1 text-center text-xs text-muted">
                      {it.text}
                    </p>
                  );
                }
                if (it.kind === "context") {
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-center gap-1.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-subtle"
                    >
                      {it.game ? (
                        <>
                          {it.game.cover && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={it.game.cover}
                              alt=""
                              className="h-5 w-5 rounded object-cover"
                            />
                          )}
                          Now chatting · {it.game.title}
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          General
                        </>
                      )}
                    </div>
                  );
                }
                // candidates
                return (
                  <div key={i} className="space-y-1.5">
                    <p className="px-1 text-xs text-muted">
                      {it.candidates.length === 1
                        ? "Tap the cover to chat about this game:"
                        : "Did you mean one of these? Tap a cover:"}
                    </p>
                    {it.candidates.map((c) => (
                      <button
                        key={c._id}
                        onClick={() => pickCandidate(c, it.question)}
                        disabled={busy}
                        className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface p-2 text-left transition-colors hover:border-accent/50 hover:bg-surface-2 disabled:opacity-50"
                      >
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                          {(c.thumbnailUrl ?? c.imageUrl) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.thumbnailUrl ?? c.imageUrl ?? ""}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-subtle">
                              <Die className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="font-display block truncate text-sm font-bold">
                            {c.title}
                          </span>
                          {!c.hasRulebooks && (
                            <span className="text-[11px] text-subtle">
                              no rulebook yet
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}

              {streaming !== null && (
                <div className="msg-in flex justify-start">
                  <div className="prose-chat max-w-[92%] rounded-2xl rounded-bl-sm border border-border bg-surface px-3.5 py-2.5 text-sm">
                    {streaming ? (
                      <ReactMarkdown>{cleanAnswer(streaming)}</ReactMarkdown>
                    ) : (
                      <ThinkingIndicator />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-border bg-surface px-3 py-2">
              <ChatInput onSend={send} disabled={busy} onFocus={ensureGuest} />
              {remaining != null && (
                <p className="mt-1 px-1 text-[11px] text-subtle">
                  {remaining.toLocaleString()} tokens left today
                  {budget?.isGuest && (
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
          </div>
        </>
      )}
    </>
  );
}
