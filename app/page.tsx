import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { FileText, Quote, Wand2 } from "lucide-react";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { FeatureCarousel } from "@/components/landing/FeatureCarousel";
import { AskAiButton } from "@/components/landing/AskAiButton";

const description =
  "Meepletron is your AI rules referee for every board game — ask a question in plain English and get an answer quoted straight from the rulebook, with citations. Plus a growing game library, BoardGameGeek collection sync, a tuckbox designer, a first-player picker and yearly top-games lists.";

export const metadata: Metadata = {
  title: { absolute: "Meepletron — Ask your board game rules" },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Meepletron — Ask your board game rules",
    description,
    url: "/",
    type: "website",
  },
};

// Floating game pieces drifting behind the hero (desktop only, subtle).
const PIECES: { emoji: string; className: string; style: CSSProperties }[] = [
  { emoji: "🎲", className: "left-[8%] top-[18%] text-5xl", style: { ["--r"]: "-12deg", ["--float-dur"]: "6s", animationDelay: "0s" } as CSSProperties },
  { emoji: "🧩", className: "right-[10%] top-[22%] text-4xl", style: { ["--r"]: "10deg", ["--float-dur"]: "7s", animationDelay: "0.6s" } as CSSProperties },
  { emoji: "♟️", className: "left-[14%] bottom-[20%] text-4xl", style: { ["--r"]: "6deg", ["--float-dur"]: "5.5s", animationDelay: "1.1s" } as CSSProperties },
  { emoji: "🃏", className: "right-[13%] bottom-[24%] text-5xl", style: { ["--r"]: "-8deg", ["--float-dur"]: "6.5s", animationDelay: "0.3s" } as CSSProperties },
  { emoji: "🎯", className: "left-[46%] top-[10%] text-3xl", style: { ["--r"]: "0deg", ["--float-dur"]: "8s", animationDelay: "1.4s" } as CSSProperties },
];

const STATS = [
  { value: "5,243", label: "messages answered" },
  { value: "166", label: "users" },
  { value: "92%", label: "success rate" },
];

// The launch story: what changed under the hood, in plain language.
const TECH = [
  {
    icon: FileText,
    title: "Rulebooks read, not scraped",
    body: "Every rulebook is transcribed page by page into structured text — headings, tables and the game's own iconography kept intact — then split along its real sections instead of at arbitrary character counts.",
  },
  {
    icon: Wand2,
    title: "Your question, in rulebook words",
    body: "Table-talk rarely matches rulebook vocabulary, so your question is rewritten into the terms the book actually uses, matched against the whole rulebook, then re-ranked so the passage that answers it comes out on top.",
  },
  {
    icon: Quote,
    title: "Answers with receipts",
    body: "Every answer carries numbered citations back to the passages it came from — section and page — so you can check the ruling yourself before anyone argues about it.",
  },
];

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Aurora background */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[130vh] overflow-hidden">
        <div
          className="aurora absolute -left-24 top-[-10%] h-80 w-80 rounded-full bg-accent/25 blur-3xl"
          style={{ ["--aurora-dur"]: "20s" } as CSSProperties}
        />
        <div
          className="aurora absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-accent/20 blur-3xl"
          style={{ ["--aurora-dur"]: "26s", animationDelay: "3s" } as CSSProperties}
        />
        <div
          className="aurora absolute bottom-[-15%] left-1/4 h-72 w-72 rounded-full bg-accent-2/15 blur-3xl"
          style={{ ["--aurora-dur"]: "23s", animationDelay: "1.5s" } as CSSProperties}
        />
      </div>

      {/* ---------- Hero ---------- */}
      <section className="relative flex flex-col items-center px-6 pb-14 pt-14 text-center sm:pt-20">
        {PIECES.map((p, i) => (
          <span
            key={i}
            aria-hidden
            className={`float pointer-events-none absolute hidden select-none opacity-20 blur-[1px] sm:block ${p.className}`}
            style={p.style}
          >
            {p.emoji}
          </span>
        ))}

        {/* Launch badge */}
        <div className="animate-in mb-7 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-accent backdrop-blur">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          Officially launched
        </div>

        <Image
          src="/logo.webp"
          alt="Meepletron"
          width={128}
          height={160}
          priority
          className="float mb-6 h-24 w-auto drop-shadow-xl sm:h-28"
          style={{ ["--float-dur"]: "6s" } as CSSProperties}
        />

        <h1
          className="font-display animate-in text-shimmer text-balance text-5xl font-extrabold tracking-tight sm:text-7xl"
          style={{ animationDelay: "80ms" }}
        >
          Meepletron
        </h1>

        <p
          className="animate-in mt-4 text-balance text-xl font-bold text-foreground sm:text-2xl"
          style={{ animationDelay: "160ms" }}
        >
          Your AI rules referee for every board game.
        </p>

        <p
          className="animate-in mt-4 max-w-2xl text-balance text-base text-muted sm:text-lg"
          style={{ animationDelay: "240ms" }}
        >
          Ask a rules question the way you&apos;d say it at the table and get a
          straight answer, quoted from the actual rulebook with the page it came
          from. 
        </p>

        <div
          className="animate-in mt-8 flex items-center justify-center gap-2 sm:gap-3"
          style={{ animationDelay: "320ms" }}
        >
          <Link
            href="/boardgames"
            className={buttonClasses(
              "primary",
              "md",
              "whitespace-nowrap sm:h-12 sm:px-6 sm:text-base",
            )}
          >
            Browse the library
          </Link>
          <AskAiButton
            size="md"
            className="whitespace-nowrap sm:h-12 sm:px-6 sm:text-base"
          />
        </div>
      </section>

      {/* ---------- What Meepletron does ---------- */}
      <section className="mx-auto max-w-4xl px-4 pb-16">
        <div className="mb-5 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
            What Meepletron does
          </p>
          <h2 className="font-display mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Seven tools to use on your game night
          </h2>
          <p className="mt-2 text-sm text-muted">
            Swipe through: each one comes with the short version of how to use
            it.
          </p>
        </div>

        <FeatureCarousel />
      </section>

      {/* ---------- The launch / new tech ---------- */}
      <section className="border-y border-border bg-surface/50 py-16 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
              New under the hood
            </p>
            <h2 className="font-display mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
              This is the official launch
            </h2>
            <p className="mt-3 text-base text-muted">
              The beta proved people would rather ask than flip back through a
              rulebook. So we rebuilt the part that matters: a new way of
              parsing rulebook text that keeps a game&apos;s structure and
              symbols intact, for noticeably more accurate answers and a
              citation under every one of them.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {TECH.map((t) => {
              const Icon = t.icon;
              return (
                <div
                  key={t.title}
                  className="rounded-2xl border border-border bg-surface p-6"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/12 text-accent">
                    <Icon className="h-5.5 w-5.5" />
                  </div>
                  <h3 className="font-display mt-4 text-lg font-bold">
                    {t.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {t.body}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Beta receipts */}
          <div className="mt-10 flex flex-wrap items-stretch justify-center gap-3">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="min-w-34 rounded-2xl border border-border bg-surface px-5 py-4 text-center"
              >
                <div className="text-shimmer text-3xl font-extrabold sm:text-4xl">
                  {s.value}
                </div>
                <div className="mt-1 text-xs font-medium text-muted">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Closing CTA ---------- */}
      <section className="px-6 py-16 text-center">
        <h2 className="font-display text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
          Stop flipping. Start playing.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-balance text-base text-muted">
          Free to try — ask your first question as a guest, no account needed.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link href="/boardgames" className={buttonClasses("primary", "lg")}>
            Find your game
          </Link>
          <Link href="/who-goes-first" className={buttonClasses("ghost", "lg")}>
            Who goes first?
          </Link>
        </div>
      </section>
    </div>
  );
}
