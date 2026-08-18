"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ChevronLeft,
  ChevronRight,
  Hand,
  LayoutGrid,
  MessageCircle,
  NotebookPen,
  RefreshCw,
  Scissors,
  Sparkles,
  Trophy,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { openAssistant } from "@/lib/assistant";
import { usePreferences } from "@/lib/usePreferences";
import { cn } from "@/lib/cn";

type Feature = {
  key: string;
  icon: LucideIcon;
  title: string;
  tagline: string;
  /** The short "how do I actually use this" line — the point of the carousel. */
  how: string;
  badge?: string;
  /** A link CTA, or `assistant` to pop the floating assistant open in place. */
  cta?: { label: string; href: string } | { label: string; assistant: true };
};

const FEATURES: Feature[] = [
  {
    key: "chat",
    icon: MessageCircle,
    title: "Chat with a game's rules",
    tagline: "An AI referee that has actually read the rulebook.",
    how: "Open a game from the library and hit Ask. Type or speak the question the way you'd say it at the table — the answer comes back with the rulebook passage and page quoted underneath.",
    cta: { label: "Ask a game", href: "/boardgames" },
  },
  {
    key: "library",
    icon: LayoutGrid,
    title: "A library that keeps growing",
    tagline: "New games and rulebooks land every week.",
    how: "Search by title, designer or publisher, or filter by player count, play time and expansions. Game not here yet? The same search reaches into BoardGameGeek — tap a result to import it.",
    cta: { label: "Browse the library", href: "/boardgames" },
  },
  {
    key: "bgg",
    icon: RefreshCw,
    title: "Sync your BoardGameGeek collection",
    tagline: "Your BGG shelf, mirrored into Meepletron.",
    how: "Link your account under Settings → BoardGameGeek (we keep a session token, never your password) and hit Sync now. Your Owned, Wishlist, For trade and Previously owned lists fill in on the Collection tab, any game we don't have yet is added to the library with its cover and details, and a re-sync drops whatever you've since removed on BGG.",
    cta: { label: "Link BoardGameGeek", href: "/settings" },
  },
  {
    key: "tuckbox",
    icon: Scissors,
    title: "Tuckbox designer",
    tagline: "Print a custom box for any deck.",
    how: "Pick a game to borrow its artwork, size the box to your card stack, nudge the image into place, then download the flat net — fold lines, glue tabs and assembly steps included.",
    cta: { label: "Design a tuckbox", href: "/tuckbox" },
  },
  {
    key: "first-player",
    icon: Hand,
    title: "Who goes first?",
    tagline: "Settle the first-player argument in three seconds.",
    how: "Put the phone in the middle of the table, everyone holds a finger on the screen, and after three seconds one finger lights up — that player starts. No dice hunting, no arguing.",
    cta: { label: "Pick a first player", href: "/who-goes-first" },
  },
  {
    key: "top-games",
    icon: Trophy,
    title: "Top games lists",
    tagline: "Your year in board games, ranked.",
    how: "Start a list of 10, 25, 50 or 100 for the year, drag your games into order, then finalize it. Share it from your profile and see how far each game climbed or slipped since last year.",
    cta: { label: "Build your list", href: "/top-games" },
  },
  {
    key: "assistant",
    icon: Sparkles,
    badge: "Beta",
    title: "Meepletron AI, on every page",
    tagline: "The floating assistant that follows you around the site.",
    how: "Tap the bubble in the bottom corner from any page. Ask a general board-game question, or name a game and it drops straight into that rulebook — without making you leave the page. Voice input works too.",
    cta: { label: "Try the assistant", assistant: true },
  },
  {
    key: "plays",
    icon: NotebookPen,
    badge: "Coming soon",
    title: "Logging plays",
    tagline: "Turn your shelf into a play history.",
    how: "We're building both halves: importing your BoardGameGeek play history so everything you've already logged comes with you, and logging new plays straight into Meepletron from the game's page — who was there, who won, the scores, how long it ran.",
  },
];

const AUTOPLAY_MS = 7000;

export function FeatureCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // Autoplay stops for good once the reader takes the wheel; hovering only
  // pauses it.
  const [taken, setTaken] = useState(false);
  const [hovering, setHovering] = useState(false);

  const { reduceMotion } = usePreferences();
  const [osReduceMotion, setOsReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setOsReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const still = reduceMotion || osReduceMotion;

  const scrollToSlide = useCallback(
    (i: number, smooth: boolean) => {
      const el = trackRef.current;
      if (!el) return;
      const clamped = (i + FEATURES.length) % FEATURES.length;
      el.scrollTo({
        left: clamped * el.clientWidth,
        behavior: smooth && !still ? "smooth" : "auto",
      });
    },
    [still],
  );

  /** Manual navigation — retires the autoplay. */
  const go = useCallback(
    (i: number) => {
      setTaken(true);
      scrollToSlide(i, true);
    },
    [scrollToSlide],
  );

  useEffect(() => {
    if (taken || still || hovering) return;
    const id = setInterval(() => {
      const el = trackRef.current;
      if (!el || el.clientWidth === 0) return;
      scrollToSlide(Math.round(el.scrollLeft / el.clientWidth) + 1, true);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [taken, still, hovering, scrollToSlide]);

  // The scroll position is the source of truth for the active dot, so swiping,
  // clicking a dot and autoplay all stay in sync.
  function onScroll() {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((prev) => (prev === i ? prev : Math.min(FEATURES.length - 1, Math.max(0, i))));
  }

  // A resize (or orientation flip) changes the slide width — re-anchor so we
  // never come to rest between two slides.
  useEffect(() => {
    const onResize = () => scrollToSlide(index, false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [index, scrollToSlide]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="What Meepletron does"
      className="relative"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocusCapture={() => setHovering(true)}
      onBlurCapture={() => setHovering(false)}
      onPointerDown={() => setTaken(true)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        else if (e.key === "ArrowLeft") go(index - 1);
      }}
    >
      <div
        ref={trackRef}
        onScroll={onScroll}
        tabIndex={0}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <div
              key={f.key}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${FEATURES.length}: ${f.title}`}
              className="w-full shrink-0 snap-center"
            >
              <article className="flex h-full flex-col gap-5 rounded-3xl border border-border bg-surface/75 p-6 backdrop-blur sm:flex-row sm:gap-7 sm:p-8">
                <div
                  aria-hidden
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent sm:h-16 sm:w-16"
                >
                  <Icon className="h-7 w-7 sm:h-8 sm:w-8" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
                      {f.title}
                    </h3>
                    {f.badge && (
                      <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-accent">
                        {f.badge}
                      </span>
                    )}
                  </div>

                  <p className="mt-1.5 text-base font-semibold text-accent-2">
                    {f.tagline}
                  </p>

                  <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
                    <span className="font-bold text-foreground">How to use it: </span>
                    {f.how}
                  </p>

                  {f.cta && (
                    <div className="mt-5">
                      {"href" in f.cta ? (
                        <Link href={f.cta.href} className={buttonClasses("primary", "md")}>
                          {f.cta.label}
                        </Link>
                      ) : (
                        <button
                          onClick={openAssistant}
                          className={buttonClasses("primary", "md")}
                        >
                          {f.cta.label}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          onClick={() => go(index - 1)}
          aria-label="Previous feature"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <ChevronLeft className="h-4.5 w-4.5" />
        </button>

        <div className="flex items-center gap-1.5">
          {FEATURES.map((f, i) => (
            <button
              key={f.key}
              onClick={() => go(i)}
              aria-label={`Go to ${f.title}`}
              aria-current={i === index ? "true" : undefined}
              className={cn(
                "h-2 rounded-full transition-all",
                i === index
                  ? "w-6 bg-accent"
                  : "w-2 bg-border hover:bg-subtle",
              )}
            />
          ))}
        </div>

        <button
          onClick={() => go(index + 1)}
          aria-label="Next feature"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <ChevronRight className="h-4.5 w-4.5" />
        </button>
      </div>
    </section>
  );
}
