"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import {
  ArrowUp,
  ArrowDown,
  Globe,
  Lock,
  RotateCcw,
  Trash2,
  Star,
  Trophy,
  Crown,
  List,
  Sparkles,
  Play,
  Pause,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Thumb } from "./Thumb";
import { CoverScroller } from "./CoverScroller";
import { ShareButton } from "@/components/boardgames/ShareButton";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { Chip } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";
import { topListTitle } from "@/lib/topGamesTitle";
import { categoryLabel } from "@/convex/lib/topGamesCategories";

type TopTag = "same" | "moved" | "new" | "back" | null;

type Item = {
  rank: number;
  gameId: Id<"games">;
  title: string;
  game: { slug: string; title: string; thumbUrl: string | null } | null;
  movement: number | null;
  tag: TopTag;
  history: { year: number; rank: number }[];
};

export type TopListData = {
  _id: Id<"topGamesLists">;
  category: string;
  size: number;
  year: number;
  title: string | null;
  status: "draft" | "finalized";
  visibility: "private" | "public";
  count: number;
  finalizedAt: number | null;
  isOwner: boolean;
  author: { username: string | null; name: string | null; avatarUrl: string | null } | null;
  items: Item[];
  droppedOff: {
    gameId: Id<"games">;
    title: string;
    lastRank: number;
    game: { slug: string; title: string; thumbUrl: string | null } | null;
  }[];
  hasPrior: boolean;
  prevYear: number | null;
};

// Metallic accents for the podium (top 3).
const MEDAL: Record<number, { color: string; glow: string }> = {
  1: { color: "#f4b60c", glow: "244,182,12" },
  2: { color: "#aab2bd", glow: "170,178,189" },
  3: { color: "#cd7f43", glow: "205,127,67" },
};

/** localStorage key for the remembered List/Reveal choice. */
const VIEW_KEY = "topGamesView";

function historyLine(item: Item) {
  return item.history.map((h) => `#${h.rank} in ${h.year}`).join(" · ");
}

function MovementBadge({ item, onDark = false }: { item: Item; onDark?: boolean }) {
  if (item.tag === "new") {
    return (
      <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-foreground">
        New
      </span>
    );
  }
  if (item.tag === "back") {
    return (
      <span className="rounded-full bg-accent-2 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-2-foreground">
        Back
      </span>
    );
  }
  if (item.tag === "moved" && item.movement != null) {
    const up = item.movement > 0;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 text-xs font-bold tabular-nums",
          up
            ? onDark
              ? "text-emerald-300"
              : "text-accent-2"
            : onDark
              ? "text-white/60"
              : "text-muted",
        )}
        title={`${up ? "Up" : "Down"} ${Math.abs(item.movement)} from last year`}
      >
        {up ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
        {Math.abs(item.movement)}
      </span>
    );
  }
  if (item.tag === "same") {
    return (
      <span
        className={cn("text-xs font-bold", onDark ? "text-white/50" : "text-subtle")}
        title="No change"
      >
        —
      </span>
    );
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* List mode                                                                  */
/* -------------------------------------------------------------------------- */

function RankRow({ item, index = 0 }: { item: Item; index?: number }) {
  const medal = MEDAL[item.rank];
  const inner = (
    <>
      <span
        className="flex w-9 shrink-0 items-center justify-center text-xl font-black tabular-nums text-muted"
        style={medal ? { color: medal.color } : undefined}
      >
        {item.rank}
      </span>
      <Thumb url={item.game?.thumbUrl} className="h-12 w-12" />
      <div className="min-w-0 flex-1">
        <span className="font-display block truncate font-bold">
          {item.game?.title ?? item.title}
        </span>
        {item.history.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-subtle">{historyLine(item)}</p>
        )}
      </div>
      <MovementBadge item={item} />
    </>
  );
  return (
    <li
      className="animate-in flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5 pr-3"
      style={{
        animationDelay: `${Math.min(index, 24) * 35}ms`,
        ...(medal ? { boxShadow: `inset 3px 0 0 ${medal.color}` } : {}),
      }}
    >
      {item.game?.slug ? (
        <Link
          href={`/boardgames/${item.game.slug}`}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{inner}</div>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Reveal mode                                                                */
/* -------------------------------------------------------------------------- */

type RevealFrom = "left" | "right" | "bottomLeft" | "bottomRight" | "bottom";

// Where each card starts before sliding into place.
const HIDDEN: Record<RevealFrom, string> = {
  left: "translate3d(-48px, 22px, 0) scale(0.94)",
  right: "translate3d(48px, 22px, 0) scale(0.94)",
  bottomLeft: "translate3d(-40px, 52px, 0) scale(0.9)",
  bottomRight: "translate3d(40px, 52px, 0) scale(0.9)",
  bottom: "translate3d(0, 52px, 0) scale(0.9)",
};

// Weighted toward the bottom corners; deterministic per game so it never
// reshuffles on re-render (and matches between server + client).
const DIRS: RevealFrom[] = [
  "bottomLeft",
  "bottomRight",
  "bottomLeft",
  "bottomRight",
  "left",
  "right",
  "bottom",
];
function pickDir(id: string): RevealFrom {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return DIRS[Math.abs(h) % DIRS.length];
}

/** Wraps a card so it slides in from `from` the first time it scrolls into view. */
function Reveal({
  from,
  boom = false,
  children,
}: {
  from: RevealFrom;
  boom?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShown(true);
          obs.disconnect();
        }
      },
      // Only fire once a card has scrolled up into the upper part of the screen,
      // so the reveal takes more scrolling to reach.
      { threshold: 0, rootMargin: "0px 0px -45% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  // Springy overshoot for the podium, smooth ease-out for the rest.
  const ease = boom ? "cubic-bezier(0.16, 1.42, 0.4, 1)" : "cubic-bezier(0.22, 1, 0.36, 1)";
  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translate3d(0,0,0) scale(1)" : HIDDEN[from],
        transition: `opacity 0.5s ease, transform ${boom ? "0.8s" : "0.6s"} ${ease}`,
        willChange: "transform, opacity",
      }}
    >
      {children}
    </div>
  );
}

function RevealRow({ item }: { item: Item }) {
  const inner = (
    <div className="relative flex items-center gap-3.5 overflow-hidden rounded-2xl border border-border bg-surface p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md sm:gap-4 sm:p-4">
      <span className="font-display w-9 shrink-0 text-center text-3xl font-extrabold tabular-nums text-subtle sm:w-11 sm:text-4xl">
        {item.rank}
      </span>
      <Thumb
        url={item.game?.thumbUrl}
        className="h-16 w-16 ring-1 ring-border sm:h-18 sm:w-18"
      />
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-base font-bold leading-snug sm:text-lg">
          {item.game?.title ?? item.title}
        </h3>
        {item.history.length > 0 && (
          <p className="mt-1 truncate text-xs text-subtle">{historyLine(item)}</p>
        )}
      </div>
      <MovementBadge item={item} />
    </div>
  );
  return item.game?.slug ? (
    <Link href={`/boardgames/${item.game.slug}`} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function PodiumCard({ item }: { item: Item }) {
  const medal = MEDAL[item.rank];
  const cover = item.game?.thumbUrl ?? null;
  const first = item.rank === 1;
  const shadow = "0 2px 12px rgba(0,0,0,0.85)";
  const inner = (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-3xl p-5 text-center sm:p-6",
        first ? "min-h-72 sm:min-h-80" : "min-h-56 sm:min-h-64",
      )}
      style={{
        boxShadow: `inset 0 0 0 2px ${medal.color}, 0 18px 50px -18px rgba(${medal.glow},0.7)`,
      }}
    >
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-xl"
        />
      ) : (
        <div className="absolute inset-0 bg-surface-2" />
      )}
      <div className="absolute inset-0 bg-linear-to-t from-black/95 via-black/70 to-black/45" />

      {/* Rank number, pinned top-left. */}
      <div className="absolute left-4 top-3 z-10 flex items-center gap-1.5 sm:left-5 sm:top-4">
        {first && (
          <Crown
            className="h-6 w-6 sm:h-8 sm:w-8"
            style={{ color: medal.color, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.7))" }}
          />
        )}
        <span
          className="font-display font-black leading-none tabular-nums"
          style={{
            color: medal.color,
            fontSize: first ? "clamp(2.5rem,10vw,4.5rem)" : "clamp(2rem,7vw,3.25rem)",
            textShadow: `0 2px 16px rgba(0,0,0,0.75), 0 0 24px rgba(${medal.glow},0.45)`,
          }}
        >
          {item.rank}
        </span>
      </div>

      {/* Big centered cover + title. */}
      <div className="relative flex flex-col items-center gap-3">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className={cn(
              "rounded-2xl object-cover shadow-2xl ring-1 ring-white/25",
              first ? "h-40 w-40 sm:h-52 sm:w-52" : "h-28 w-28 sm:h-40 sm:w-40",
            )}
          />
        )}
        <div className="min-w-0">
          <h3
            className={cn(
              "font-display font-extrabold wrap-break-word text-white",
              first ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl",
            )}
            style={{ textShadow: shadow }}
          >
            {item.game?.title ?? item.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <MovementBadge item={item} onDark />
            {item.history.length > 0 && (
              <span className="text-xs text-white/85" style={{ textShadow: shadow }}>
                {historyLine(item)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
  return item.game?.slug ? (
    <Link href={`/boardgames/${item.game.slug}`} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/**
 * Gentle auto-scroll for the countdown; any manual scroll pauses it. Stops once
 * `stopRef` (the #1 card) is centred in the viewport, or the page bottom.
 */
function useAutoScroll(
  stopRef: React.RefObject<HTMLElement | null>,
  ready = true,
): {
  playing: boolean;
  toggle: () => void;
} {
  const [playing, setPlaying] = useState(() => {
    if (typeof window === "undefined") return true;
    return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  });

  // The animation loop — held until `ready` (e.g. the honorable-mentions
  // intro has finished) so the page doesn't scroll away from it.
  useEffect(() => {
    if (!playing || !ready) return;
    let raf = 0;
    let last = 0;
    let target = window.scrollY;
    const SPEED = 90; // px/second
    const tick = (t: number) => {
      if (last) {
        target += (SPEED * (t - last)) / 1000;
        window.scrollTo(0, target);
        // Stop when #1 has risen to the middle of the screen…
        const el = stopRef.current;
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.top + r.height / 2 <= window.innerHeight / 2) {
            setPlaying(false);
            return;
          }
        }
        // …or if we somehow reach the very bottom first.
        if (
          window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 2
        ) {
          setPlaying(false);
          return;
        }
      }
      last = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, ready, stopRef]);

  // Any real user input hands control back.
  useEffect(() => {
    if (!playing) return;
    const pause = () => setPlaying(false);
    const opts = { passive: true } as const;
    window.addEventListener("wheel", pause, opts);
    window.addEventListener("touchmove", pause, opts);
    window.addEventListener("keydown", pause);
    return () => {
      window.removeEventListener("wheel", pause);
      window.removeEventListener("touchmove", pause);
      window.removeEventListener("keydown", pause);
    };
  }, [playing]);

  return { playing, toggle: () => setPlaying((p) => !p) };
}

/**
 * The honorable-mentions intro: cards fly in one at a time, left to right, the
 * strip scrolling to follow the newest. Calls `onDone` once the last has landed,
 * which releases the vertical auto-scroll into the main countdown.
 */
function HonorableReveal({
  items,
  onDone,
}: {
  items: Item[];
  onDone: () => void;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);

  // Center the honorable strip in the viewport as the reveal begins, then start
  // dealing the cards once it's settled.
  useEffect(() => {
    sectionRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(() => setStarted(true), 600);
    return () => clearTimeout(t);
  }, []);

  // Reveal the next card on a slow beat; a longer pause after the last so it can
  // be taken in, then onDone releases the scroll down into the countdown.
  useEffect(() => {
    if (!started) return;
    if (count >= items.length) {
      const t = setTimeout(onDone, 1200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCount((c) => c + 1), 850);
    return () => clearTimeout(t);
  }, [started, count, items.length, onDone]);

  // Follow the newest card to the right edge.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [count]);

  return (
    <div ref={sectionRef} className="mb-8">
      <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-accent-2">
        <Star className="h-3.5 w-3.5" />
        Honorable mentions
      </h2>
      <div
        ref={scrollerRef}
        style={{ scrollbarWidth: "none" }}
        className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0"
      >
        {items.slice(0, count).map((item) => {
          const inner = (
            <>
              <Thumb url={item.game?.thumbUrl} className="aspect-square w-full" />
              <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-tight text-muted">
                {item.game?.title ?? item.title}
              </p>
            </>
          );
          return (
            <div key={item.gameId} className="msg-in w-28 shrink-0 sm:w-32">
              {item.game?.slug ? (
                <Link href={`/boardgames/${item.game.slug}`} className="block">
                  {inner}
                </Link>
              ) : (
                <div>{inner}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RevealShow({
  items,
  honorable,
}: {
  items: Item[];
  honorable: Item[];
}) {
  // Reverse: highest rank first, counting down to #1 (the climax) at the bottom.
  const reversed = [...items].sort((a, b) => b.rank - a.rank);
  const firstRef = useRef<HTMLDivElement>(null);
  // Hold the countdown auto-scroll until the honorable intro finishes.
  const [honorableDone, setHonorableDone] = useState(honorable.length === 0);
  const markDone = useCallback(() => setHonorableDone(true), []);
  const auto = useAutoScroll(firstRef, honorableDone);
  return (
    // clip-x so the sideways slide-in never spawns a horizontal scrollbar.
    <div className="space-y-3 overflow-x-clip">
      {honorable.length > 0 && (
        <HonorableReveal items={honorable} onDone={markDone} />
      )}
      <p className="text-center text-xs font-bold uppercase tracking-[0.25em] text-subtle">
        The countdown ↓
      </p>
      {reversed.map((item) => (
        <div key={item.gameId} ref={item.rank === 1 ? firstRef : undefined}>
          <Reveal from={pickDir(item.gameId)} boom={item.rank <= 3}>
            {item.rank <= 3 ? <PodiumCard item={item} /> : <RevealRow item={item} />}
          </Reveal>
        </div>
      ))}
      {/* Tail room so #1 can scroll up to the middle. */}
      <div aria-hidden className="h-[25vh]" />

      {/* Auto-scroll control. */}
      <button
        type="button"
        onClick={auto.toggle}
        className="fixed bottom-[calc(3.75rem+env(safe-area-inset-bottom))] left-4 z-30 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/90 px-3.5 py-2 text-sm font-semibold text-foreground shadow-lg backdrop-blur transition-colors hover:border-accent/50 sm:bottom-6 sm:left-6"
      >
        {auto.playing ? (
          <>
            <Pause className="h-4 w-4" />
            Pause
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            Play
          </>
        )}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

// Square icon buttons for the owner action row on a finalized list.
const ICON_BTN =
  "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-foreground transition-all hover:bg-surface-2 active:scale-[0.98]";
const DELETE_ICON_BTN =
  "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-muted transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600 active:scale-[0.98] dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-400";

export function TopGamesView({ data }: { data: TopListData }) {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const reopen = useMutation(api.topGames.reopen);
  const setVisibility = useMutation(api.topGames.setVisibility);
  const remove = useMutation(api.topGames.remove);
  const [mode, setMode] = useState<"list" | "reveal">(() =>
    typeof window === "undefined"
      ? "reveal"
      : ((localStorage.getItem(VIEW_KEY) as "list" | "reveal" | null) ?? "reveal"),
  );

  function pickMode(m: "list" | "reveal") {
    setMode(m);
    try {
      localStorage.setItem(VIEW_KEY, m);
    } catch {
      /* localStorage may be unavailable (private mode); ignore. */
    }
  }

  const heading = topListTitle(data.size, data.year, data.title);
  const isPublic = data.visibility === "public";
  const mainItems = data.items.filter((i) => i.rank <= data.size);
  const honorable = data.items.filter((i) => i.rank > data.size);

  async function onReopen() {
    const ok = await confirm({
      title: "Reopen for editing?",
      message: "This turns the list back into a private draft until you finalize again.",
      confirmText: "Reopen",
    });
    if (ok) await reopen({ id: data._id });
  }

  async function togglePublic() {
    try {
      await setVisibility({ id: data._id, visibility: isPublic ? "private" : "public" });
      toast(isPublic ? "List is now private." : "List is public — share the link!", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update.", "error");
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: "Delete this list?",
      message: `“${heading}” and its rankings will be permanently deleted. This can't be undone.`,
      confirmText: "Delete list",
      danger: true,
    });
    if (!ok) return;
    try {
      await remove({ id: data._id });
      toast("List deleted.", "success");
      router.push("/top-games");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete the list.", "error");
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 text-accent">
          <Trophy className="h-5 w-5" />
          <span className="text-sm font-bold uppercase tracking-[0.14em]">
            Top {data.size}
            {data.category !== "overall" && ` · ${categoryLabel(data.category)}`} ·{" "}
            {data.year}
          </span>
        </div>
        <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight">
          {heading}
        </h1>

        {data.author && (
          <div className="mt-2 flex items-center gap-2 text-sm text-muted">
            {data.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.author.avatarUrl}
                alt=""
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : null}
            <span>
              by{" "}
              {data.author.username ? (
                <Link
                  href={`/user/${data.author.username}`}
                  className="font-semibold text-foreground hover:text-accent"
                >
                  {data.author.name ?? data.author.username}
                </Link>
              ) : (
                <span className="font-semibold text-foreground">
                  {data.author.name ?? "Someone"}
                </span>
              )}
            </span>
          </div>
        )}

        {data.isOwner && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={onReopen}
              title="Reopen to edit"
              aria-label="Reopen to edit"
              className={ICON_BTN}
            >
              <RotateCcw className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={togglePublic}
              title={isPublic ? "Make private" : "Make public"}
              aria-label={isPublic ? "Make private" : "Make public"}
              className={ICON_BTN}
            >
              {isPublic ? (
                <Lock className="h-4.5 w-4.5" />
              ) : (
                <Globe className="h-4.5 w-4.5" />
              )}
            </button>
            {isPublic && (
              <ShareButton
                title={heading}
                text={`${heading} — my Top Games list on Meepletron`}
                className={ICON_BTN}
              />
            )}
            <button
              onClick={onDelete}
              title="Delete list"
              aria-label="Delete list"
              className={DELETE_ICON_BTN}
            >
              <Trash2 className="h-4.5 w-4.5" />
            </button>
          </div>
        )}
      </div>

      {/* View mode toggle */}
      <div className="mb-5 inline-flex rounded-xl border border-border bg-surface-2 p-1">
        {(
          [
            { key: "list", label: "List", icon: List },
            { key: "reveal", label: "Reveal", icon: Sparkles },
          ] as const
        ).map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              onClick={() => pickMode(m.key)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-all",
                mode === m.key
                  ? "bg-surface text-accent shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {m.label}
            </button>
          );
        })}
      </div>

      {mode === "reveal" ? (
        <RevealShow items={mainItems} honorable={honorable} />
      ) : (
        <>
          {/* Ranked list */}
          <ol className="space-y-2">
            {mainItems.map((item, i) => (
              <RankRow key={item.gameId} item={item} index={i} />
            ))}
          </ol>

          {/* Honorable mentions — a compact horizontal strip. */}
          {honorable.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-accent-2">
                <Star className="h-3.5 w-3.5" />
                Honorable mentions
              </h2>
              <CoverScroller
                items={honorable.map((item) => ({
                  key: item.gameId,
                  title: item.game?.title ?? item.title,
                  thumbUrl: item.game?.thumbUrl ?? null,
                  href: item.game?.slug
                    ? `/boardgames/${item.game.slug}`
                    : undefined,
                }))}
              />
            </div>
          )}

          {/* Fell off this year */}
          {data.droppedOff.length > 0 && (
            <div className="mt-8">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-subtle">
                Fell off this year
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {data.droppedOff.map((d) => (
                  <li key={d.gameId}>
                    <Chip className="gap-1.5">
                      {d.game?.slug ? (
                        <Link href={`/boardgames/${d.game.slug}`} className="hover:text-accent">
                          {d.game?.title ?? d.title}
                        </Link>
                      ) : (
                        (d.game?.title ?? d.title)
                      )}
                      <span className="text-subtle">was #{d.lastRank}</span>
                    </Chip>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
