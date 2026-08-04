import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Coming soon — Meepletron",
  description:
    "Meepletron is almost here — your AI rules referee for every board game. Official launch coming soon.",
};

// Floating game pieces drifting behind the hero (desktop only, subtle).
const PIECES: { emoji: string; className: string; style: CSSProperties }[] = [
  { emoji: "🎲", className: "left-[8%] top-[18%] text-5xl", style: { ["--r"]: "-12deg", ["--float-dur"]: "6s", animationDelay: "0s" } as CSSProperties },
  { emoji: "🧩", className: "right-[10%] top-[22%] text-4xl", style: { ["--r"]: "10deg", ["--float-dur"]: "7s", animationDelay: "0.6s" } as CSSProperties },
  { emoji: "♟️", className: "left-[14%] bottom-[20%] text-4xl", style: { ["--r"]: "6deg", ["--float-dur"]: "5.5s", animationDelay: "1.1s" } as CSSProperties },
  { emoji: "🃏", className: "right-[13%] bottom-[24%] text-5xl", style: { ["--r"]: "-8deg", ["--float-dur"]: "6.5s", animationDelay: "0.3s" } as CSSProperties },
  { emoji: "🎯", className: "left-[46%] top-[10%] text-3xl", style: { ["--r"]: "0deg", ["--float-dur"]: "8s", animationDelay: "1.4s" } as CSSProperties },
];

const CHIPS = ["⚡ Faster", "🧠 Smarter", "🎯 More accurate"];

const STATS = [
  { value: "5,000+", label: "AI answers in beta" },
  { value: "90%", label: "rated accurate" },
];

export default function ComingSoonPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      {/* Aurora background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="aurora absolute -left-24 top-[-10%] h-80 w-80 rounded-full bg-accent/25 blur-3xl"
          style={{ ["--aurora-dur"]: "20s" } as CSSProperties}
        />
        <div
          className="aurora absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-primary/20 blur-3xl"
          style={{ ["--aurora-dur"]: "26s", animationDelay: "3s" } as CSSProperties}
        />
        <div
          className="aurora absolute bottom-[-15%] left-1/4 h-72 w-72 rounded-full bg-accent/15 blur-3xl"
          style={{ ["--aurora-dur"]: "23s", animationDelay: "1.5s" } as CSSProperties}
        />
      </div>

      {/* Floating game pieces */}
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

      {/* Coming-soon badge */}
      <div className="animate-in mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-muted backdrop-blur">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        Launching soon
      </div>

      <Image
        src="/logo.webp"
        alt="Meepletron"
        width={128}
        height={160}
        priority
        className="float mb-6 h-28 w-auto drop-shadow-xl"
        style={{ ["--float-dur"]: "6s" } as CSSProperties}
      />

      {/* Wordmark */}
      <h1
        className="animate-in text-shimmer text-balance text-5xl font-extrabold tracking-tight sm:text-7xl"
        style={{ animationDelay: "80ms" }}
      >
        Meepletron
      </h1>

      <p
        className="animate-in mt-4 text-balance text-xl font-bold text-foreground sm:text-2xl"
        style={{ animationDelay: "160ms" }}
      >
        Meepletron is re-rolling.
      </p>

      <p
        className="animate-in mt-4 max-w-xl text-balance text-base text-muted sm:text-lg"
        style={{ animationDelay: "240ms" }}
      >
        The official launch is coming soon — and it&apos;s coming back{" "}
        <span className="font-semibold text-foreground">faster, smarter,</span>{" "}
        and <span className="font-semibold text-foreground">more accurate</span>.
        Your AI rules referee for every board game, with the exact rulebook
        passage to back up every answer.
      </p>

      {/* Beta success stats */}
      <p
        className="animate-in mt-10 text-xs font-semibold uppercase tracking-widest text-subtle"
        style={{ animationDelay: "320ms" }}
      >
        The beta was a success
      </p>
      <div className="mt-3 flex flex-wrap items-stretch justify-center gap-3">
        {STATS.map((s, i) => (
          <div
            key={s.label}
            className="animate-in min-w-[8.5rem] rounded-2xl border border-border bg-surface/70 px-5 py-4 backdrop-blur"
            style={{ animationDelay: `${400 + i * 90}ms` }}
          >
            <div className="text-shimmer text-3xl font-extrabold sm:text-4xl">
              {s.value}
            </div>
            <div className="mt-1 text-xs font-medium text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* What's leveling up */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {CHIPS.map((c, i) => (
          <span
            key={c}
            className="animate-in rounded-full border border-border bg-surface/70 px-3.5 py-1.5 text-sm font-medium text-muted backdrop-blur"
            style={{ animationDelay: `${560 + i * 80}ms` }}
          >
            {c}
          </span>
        ))}
      </div>

      <p
        className="animate-in mt-12 text-xs text-subtle"
        style={{ animationDelay: "820ms" }}
      >
        Meepletron · shuffle up &amp; deal, 2026{" "}
        {/* The die is the secret door — no visible tell; those who know click it. */}
        <Link href="/boardgames" aria-label="Enter Meepletron" className="cursor-text">
          🎲
        </Link>
      </p>
    </main>
  );
}
