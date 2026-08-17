"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useQuery, useAction, useConvex, useConvexAuth } from "convex/react";
import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { Bot, Sparkles, X, Dices, BookOpen } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { stripIconBrackets } from "@/components/chat/MessageBubble";
import { ChatInput } from "@/components/chat/ChatInput";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { Die } from "@/components/ui/icons";

const SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

type Candidate = {
  _id: Id<"games">;
  slug: string;
  title: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  hasRulebooks: boolean;
};
type RecGame = {
  _id: Id<"games">;
  slug: string;
  title: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  detail: string;
  chattable: boolean;
};
type Item =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "note"; text: string }
  | { kind: "candidates"; candidates: Candidate[] }
  | { kind: "noChat"; candidate: Candidate }
  | { kind: "recs"; games: RecGame[]; source: "owned" | "library" };

type TimeVal = "quick" | "standard" | "epic";
type CompVal = "light" | "medium" | "heavy";
type Flow = {
  step: "players" | "time" | "complexity" | "source";
  players?: number | null;
  time?: TimeVal | null;
  complexity?: CompVal | null;
};

const PLAYER_OPTS: { label: string; value: number | null }[] = [
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4", value: 4 },
  { label: "5", value: 5 },
  { label: "6+", value: 6 },
  { label: "Any", value: null },
];
const TIME_OPTS: { label: string; value: TimeVal | null }[] = [
  { label: "≤30 min", value: "quick" },
  { label: "30–90 min", value: "standard" },
  { label: "90+ min", value: "epic" },
  { label: "Any", value: null },
];
const COMP_OPTS: { label: string; value: CompVal | null }[] = [
  { label: "Light", value: "light" },
  { label: "Medium", value: "medium" },
  { label: "Heavy", value: "heavy" },
  { label: "Any", value: null },
];

function playersEcho(v: number | null): string {
  if (v == null) return "Any number of players";
  return v === 6 ? "6+ players" : `${v} player${v === 1 ? "" : "s"}`;
}

/** A tappable pill used for the recommend wizard's option chips. */
function Chip({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-surface-2 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** A large menu row (icon + title + subtitle) for the quick-start menu. */
function MenuButton({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-2.5 text-left transition-colors hover:border-accent/50 hover:bg-surface-2"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
        {icon}
      </div>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-[11px] text-subtle">{subtitle}</span>
      </span>
    </button>
  );
}

/** Strip icon tokens + inline [n] citation markers for the compact bubble view. */
function cleanAnswer(s: string): string {
  return stripIconBrackets(s).replace(/\s?\[\d+\]/g, "");
}

export function GlobalAssistant() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const hidden =
    pathname === "/" ||
    pathname === "/auth" ||
    pathname === "/who-goes-first" ||
    /^\/boardgames\/[^/]+\/chat/.test(pathname);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flow, setFlow] = useState<Flow | null>(null);
  const convex = useConvex();
  const generalHistory = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const pending = useRef<string | null>(null);

  const budget = useQuery(api.users.myBudget);
  const { isLoading, isAuthenticated } = useConvexAuth();
  const token = useAuthToken();
  const { signIn } = useAuthActions();
  const signingIn = useRef(false);

  const route = useAction(api.assistant.route);

  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, streaming, open, flow]);

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

  /** Stream a plaintext general answer from the Convex HTTP action into the bubble. */
  const answerGeneral = useCallback(
    async (question: string): Promise<void> => {
      generalHistory.current.push({ role: "user", content: question });
      setStreaming("");
      try {
        const res = await fetch(`${SITE_URL}/assistant`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ messages: generalHistory.current.slice(-12) }),
        });
        if (!res.ok || !res.body) {
          setStreaming(null);
          push({
            kind: "note",
            text:
              res.status === 429
                ? "You've reached today's message limit. Try again tomorrow."
                : "Something went wrong. Please try again.",
          });
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
        setStreaming(null);
        if (acc) {
          generalHistory.current.push({ role: "assistant", content: acc });
          push({ kind: "assistant", text: acc });
        }
      } catch {
        setStreaming(null);
        push({ kind: "note", text: "Network error. Please try again." });
      }
    },
    [token, push],
  );

  const process = useCallback(
    async (text: string) => {
      setBusy(true);
      try {
        const result = await route({ text });
        if (result.mode === "switch") {
          // A game was named — surface it as clickable covers that route to the
          // game's own chat page. The bubble itself never answers game rules.
          // Only games we can actually chat with (an ingested rulebook) are
          // clickable; a match with no rules is acknowledged but not offered.
          const cands = result.candidates;
          const chattable = cands.filter((c) => c.hasRulebooks);
          if (chattable.length > 0) {
            push({ kind: "candidates", candidates: chattable });
          } else if (cands.length > 0) {
            // We have the game but can't chat about it yet — offer to take the
            // user to its page instead of dead-ending.
            push({ kind: "noChat", candidate: cands[0] });
          } else {
            push({
              kind: "note",
              text: result.gameName
                ? `I don't have "${result.gameName}" in the library yet.`
                : "Which game are you after? Tell me its name and I'll pull it up.",
            });
          }
        } else {
          await answerGeneral(text);
        }
      } finally {
        setBusy(false);
      }
    },
    [route, answerGeneral, push],
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

  function goChat(slug: string) {
    if (busy) return;
    setOpen(false);
    router.push(`/boardgames/${slug}/chat`);
  }

  function goGame(slug: string) {
    if (busy) return;
    setOpen(false);
    router.push(`/boardgames/${slug}`);
  }

  // --- quick-start menu actions ---
  function startRecommend() {
    ensureGuest();
    setFlow({ step: "players" });
  }

  function askRules() {
    push({
      kind: "note",
      text: "Sure — which game? Type its name below and I'll pull it up.",
    });
  }

  function presetGeneral() {
    send("What can I do in Meepletron?");
  }

  /** Fetch + render recommendations, falling back to the library if the owned
   *  source can't be used. */
  async function runRecommend(
    source: "owned" | "library",
    players: number | null,
    time: TimeVal | null,
    complexity: CompVal | null,
  ) {
    setFlow(null);
    setBusy(true);
    try {
      const argsFor = (src: "owned" | "library") => ({
        source: src,
        players: players ?? undefined,
        time: time ?? undefined,
        complexity: complexity ?? undefined,
      });
      let res = await convex.query(api.games.recommend, argsFor(source));
      let effective: "owned" | "library" = source;
      if (source === "owned" && res.issue) {
        push({
          kind: "note",
          text:
            res.issue === "signin"
              ? "Sign in and link your BoardGameGeek account to get picks from your own games. Here are library picks for now:"
              : "You don't have any owned games synced yet — here are picks from the library:",
        });
        res = await convex.query(api.games.recommend, argsFor("library"));
        effective = "library";
      }
      if (res.games.length === 0) {
        push({
          kind: "note",
          text: "I couldn't find a good match for those settings. Try loosening one of them.",
        });
      } else {
        push({ kind: "recs", games: res.games, source: effective });
      }
    } catch {
      push({ kind: "note", text: "Something went wrong getting recommendations." });
    } finally {
      setBusy(false);
    }
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
            {/* Header */}
            <div className="flex items-center gap-2.5 border-b border-border bg-surface px-3 py-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
                <Sparkles className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display truncate text-sm font-bold leading-tight">
                  Assistant
                </p>
                <p className="text-[11px] text-muted">Ask about Meepletron</p>
              </div>
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
              {items.length === 0 && !flow && (
                <div className="mt-2 space-y-3">
                  <div className="px-1 text-sm text-muted">
                    <p className="font-medium text-foreground">
                      Hi! I&apos;m your Meepletron assistant.
                    </p>
                    <p className="mt-0.5">
                      Pick an option — or just type a question.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <MenuButton
                      icon={<Dices className="h-4.5 w-4.5" />}
                      title="Help me pick a game"
                      subtitle="By players, length & complexity"
                      onClick={startRecommend}
                    />
                    <MenuButton
                      icon={<BookOpen className="h-4.5 w-4.5" />}
                      title="Ask about a game's rules"
                      subtitle="Find a game and open its chat"
                      onClick={askRules}
                    />
                    <MenuButton
                      icon={<Sparkles className="h-4.5 w-4.5" />}
                      title="What can Meepletron do?"
                      subtitle="How the app works"
                      onClick={presetGeneral}
                    />
                  </div>
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
                if (it.kind === "noChat") {
                  const c = it.candidate;
                  const cover = c.thumbnailUrl ?? c.imageUrl;
                  return (
                    <div key={i} className="space-y-1.5">
                      <p className="px-1 text-xs text-muted">
                        We have{" "}
                        <span className="font-semibold text-foreground">
                          {c.title}
                        </span>{" "}
                        in the library, but its rules haven&apos;t been added
                        yet, so I can&apos;t chat about it. Want to open its
                        page?
                      </p>
                      <button
                        onClick={() => goGame(c.slug)}
                        disabled={busy}
                        className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface p-2 text-left transition-colors hover:border-accent/50 hover:bg-surface-2 disabled:opacity-50"
                      >
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={cover}
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
                          <span className="text-[11px] text-subtle">
                            View game →
                          </span>
                        </span>
                      </button>
                    </div>
                  );
                }
                if (it.kind === "recs") {
                  return (
                    <div key={i} className="space-y-1.5">
                      <p className="px-1 text-xs text-muted">
                        {it.source === "owned"
                          ? "From your collection — tap one to see it:"
                          : "From the library — tap one to see it:"}
                      </p>
                      {it.games.map((g) => (
                        <button
                          key={g._id}
                          onClick={() => goGame(g.slug)}
                          disabled={busy}
                          className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface p-2 text-left transition-colors hover:border-accent/50 hover:bg-surface-2 disabled:opacity-50"
                        >
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                            {(g.thumbnailUrl ?? g.imageUrl) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={g.thumbnailUrl ?? g.imageUrl ?? ""}
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
                              {g.title}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] text-subtle">
                              {g.detail}
                              {g.chattable && (
                                <span className="text-accent">· can chat</span>
                              )}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                }
                // candidates
                return (
                  <div key={i} className="space-y-1.5">
                    <p className="px-1 text-xs text-muted">
                      {it.candidates.length === 1
                        ? "Tap to open its chat:"
                        : "Did you mean one of these? Tap to open its chat:"}
                    </p>
                    {it.candidates.map((c) => (
                      <button
                        key={c._id}
                        onClick={() => goChat(c.slug)}
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
                          <span className="text-[11px] text-subtle">
                            Open chat →
                          </span>
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

              {/* Recommend wizard — clickable options, one step at a time. */}
              {flow && (
                <div className="msg-in space-y-2">
                  <p className="px-1 text-xs text-muted">
                    {flow.step === "players"
                      ? "How many players?"
                      : flow.step === "time"
                        ? "How long do you want to play?"
                        : flow.step === "complexity"
                          ? "How heavy should it be?"
                          : "Where should I pick from?"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {flow.step === "players" &&
                      PLAYER_OPTS.map((o) => (
                        <Chip
                          key={o.label}
                          disabled={busy}
                          onClick={() => {
                            push({ kind: "user", text: playersEcho(o.value) });
                            setFlow({ step: "time", players: o.value });
                          }}
                        >
                          {o.label}
                        </Chip>
                      ))}
                    {flow.step === "time" &&
                      TIME_OPTS.map((o) => (
                        <Chip
                          key={o.label}
                          disabled={busy}
                          onClick={() => {
                            push({ kind: "user", text: o.label });
                            setFlow({
                              step: "complexity",
                              players: flow.players,
                              time: o.value,
                            });
                          }}
                        >
                          {o.label}
                        </Chip>
                      ))}
                    {flow.step === "complexity" &&
                      COMP_OPTS.map((o) => (
                        <Chip
                          key={o.label}
                          disabled={busy}
                          onClick={() => {
                            push({ kind: "user", text: o.label });
                            setFlow({
                              step: "source",
                              players: flow.players,
                              time: flow.time,
                              complexity: o.value,
                            });
                          }}
                        >
                          {o.label}
                        </Chip>
                      ))}
                    {flow.step === "source" && (
                      <>
                        <Chip
                          disabled={busy}
                          onClick={() => {
                            push({ kind: "user", text: "From my collection" });
                            void runRecommend(
                              "owned",
                              flow.players ?? null,
                              flow.time ?? null,
                              flow.complexity ?? null,
                            );
                          }}
                        >
                          My games
                        </Chip>
                        <Chip
                          disabled={busy}
                          onClick={() => {
                            push({ kind: "user", text: "From the library" });
                            void runRecommend(
                              "library",
                              flow.players ?? null,
                              flow.time ?? null,
                              flow.complexity ?? null,
                            );
                          }}
                        >
                          The library
                        </Chip>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setFlow(null)}
                    className="px-1 text-[11px] text-subtle transition-colors hover:text-foreground"
                  >
                    Cancel
                  </button>
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
