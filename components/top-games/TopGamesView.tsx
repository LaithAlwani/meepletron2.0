"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import {
  ArrowUp,
  ArrowDown,
  Globe,
  Lock,
  Link2,
  RotateCcw,
  Star,
  Trophy,
  Crown,
  List,
  Sparkles,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Thumb } from "./Thumb";
import { CoverScroller } from "./CoverScroller";
import { buttonClasses } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { Chip } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";

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
    <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border bg-surface p-3 pr-4 transition-colors hover:border-accent/40 sm:p-4">
      <span className="font-display w-14 shrink-0 text-center text-4xl font-black tabular-nums text-subtle sm:text-5xl">
        {item.rank}
      </span>
      <Thumb url={item.game?.thumbUrl} className="h-16 w-16 sm:h-20 sm:w-20" />
      <div className="min-w-0 flex-1">
        <h3 className="font-display truncate text-lg font-bold">
          {item.game?.title ?? item.title}
        </h3>
        {item.history.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-subtle">{historyLine(item)}</p>
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
        first ? "min-h-64 sm:min-h-76" : "min-h-48 sm:min-h-56",
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
      <div className="absolute inset-0 bg-linear-to-t from-black/95 via-black/75 to-black/40" />

      {/* Centered stack. */}
      <div className="relative flex flex-col items-center gap-3">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className={cn(
              "rounded-2xl object-cover shadow-2xl ring-1 ring-white/25",
              first ? "h-28 w-28 sm:h-40 sm:w-40" : "h-20 w-20 sm:h-32 sm:w-32",
            )}
          />
        )}
        <div className="min-w-0">
          <div className="flex items-center justify-center gap-2">
            {first && (
              <Crown
                className="h-6 w-6 sm:h-8 sm:w-8"
                style={{ color: medal.color, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }}
              />
            )}
            <span
              className="font-display font-black leading-none tabular-nums"
              style={{
                color: medal.color,
                fontSize: first
                  ? "clamp(2.75rem,11vw,5rem)"
                  : "clamp(2.25rem,8vw,3.75rem)",
                textShadow: `0 2px 18px rgba(0,0,0,0.6), 0 0 24px rgba(${medal.glow},0.45)`,
              }}
            >
              {item.rank}
            </span>
          </div>
          <h3
            className={cn(
              "font-display mt-1 font-extrabold wrap-break-word text-white",
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

function RevealShow({ items }: { items: Item[] }) {
  // Reverse: highest rank first, counting down to #1 (the climax) at the bottom.
  const reversed = [...items].sort((a, b) => b.rank - a.rank);
  return (
    // clip-x so the sideways slide-in never spawns a horizontal scrollbar.
    <div className="space-y-3 overflow-x-clip">
      <p className="text-center text-xs font-bold uppercase tracking-[0.25em] text-subtle">
        The countdown ↓
      </p>
      {reversed.map((item) => (
        <Reveal key={item.gameId} from={pickDir(item.gameId)} boom={item.rank <= 3}>
          {item.rank <= 3 ? <PodiumCard item={item} /> : <RevealRow item={item} />}
        </Reveal>
      ))}
      {/* Tail room so #1 can scroll up into the reveal zone. */}
      <div aria-hidden className="h-[25vh]" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function TopGamesView({ data }: { data: TopListData }) {
  const toast = useToast();
  const confirm = useConfirm();
  const reopen = useMutation(api.topGames.reopen);
  const setVisibility = useMutation(api.topGames.setVisibility);
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

  const heading = data.title ?? `Top ${data.size} · ${data.year}`;
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

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Link copied.", "success");
    } catch {
      toast("Couldn't copy the link.", "error");
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 text-accent">
          <Trophy className="h-5 w-5" />
          <span className="text-sm font-bold uppercase tracking-[0.14em]">
            Top {data.size} · {data.year}
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
            <button onClick={onReopen} className={buttonClasses("ghost", "sm")}>
              <RotateCcw className="h-4 w-4" />
              Reopen to edit
            </button>
            <button onClick={togglePublic} className={buttonClasses("ghost", "sm")}>
              {isPublic ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
              {isPublic ? "Make private" : "Make public"}
            </button>
            {isPublic && (
              <button onClick={copyLink} className={buttonClasses("subtle", "sm")}>
                <Link2 className="h-4 w-4" />
                Copy link
              </button>
            )}
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
        <RevealShow items={mainItems} />
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
