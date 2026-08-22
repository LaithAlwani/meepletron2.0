import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: { absolute: "Coming soon — Meepletron" },
  description:
    "We're changing things up at Meepletron — major changes are coming. Sit tight, it'll be worth the wait.",
  alternates: { canonical: "/" },
};

// Floating game pieces drifting behind the hero (desktop only, subtle).
const PIECES: { emoji: string; className: string; style: CSSProperties }[] = [
  { emoji: "🎲", className: "left-[8%] top-[18%] text-5xl", style: { ["--r"]: "-12deg", ["--float-dur"]: "6s", animationDelay: "0s" } as CSSProperties },
  { emoji: "🧩", className: "right-[10%] top-[22%] text-4xl", style: { ["--r"]: "10deg", ["--float-dur"]: "7s", animationDelay: "0.6s" } as CSSProperties },
  { emoji: "♟️", className: "left-[14%] bottom-[20%] text-4xl", style: { ["--r"]: "6deg", ["--float-dur"]: "5.5s", animationDelay: "1.1s" } as CSSProperties },
  { emoji: "🃏", className: "right-[13%] bottom-[24%] text-5xl", style: { ["--r"]: "-8deg", ["--float-dur"]: "6.5s", animationDelay: "0.3s" } as CSSProperties },
  { emoji: "🎯", className: "left-[46%] top-[10%] text-3xl", style: { ["--r"]: "0deg", ["--float-dur"]: "8s", animationDelay: "1.4s" } as CSSProperties },
];

const CHIPS = ["📸 Share your plays", "🏆 Top Games lists", "🤝 Follow friends"];

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
          className="aurora absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-accent/20 blur-3xl"
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
        Major update in progress
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
        className="font-display animate-in text-shimmer text-balance text-5xl font-extrabold tracking-tight sm:text-7xl"
        style={{ animationDelay: "80ms" }}
      >
        Meepletron
      </h1>

      <p
        className="animate-in mt-4 text-balance text-xl font-bold text-foreground sm:text-2xl"
        style={{ animationDelay: "160ms" }}
      >
        We&apos;re changing things up.
      </p>

      <p
        className="animate-in mt-4 max-w-xl text-balance text-base text-muted sm:text-lg"
        style={{ animationDelay: "240ms" }}
      >
        Big things are in the works —{" "}
        <span className="font-semibold text-foreground">major changes</span> are
        on the way as we rebuild Meepletron into something better. Sit tight;
        it&apos;ll be worth the wait.
      </p>

      {/* A hint of what's coming */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
        {CHIPS.map((c, i) => (
          <span
            key={c}
            className="animate-in rounded-full border border-border bg-surface/70 px-3.5 py-1.5 text-sm font-medium text-muted backdrop-blur"
            style={{ animationDelay: `${360 + i * 80}ms` }}
          >
            {c}
          </span>
        ))}
      </div>

      <p
        className="animate-in mt-12 text-xs text-subtle"
        style={{ animationDelay: "700ms" }}
      >
        Meepletron · shuffle up &amp; deal, 2026{" "}
        {/* The die is the secret door — no visible tell; those who know click it. */}
        <Link href="/feed" aria-label="Enter Meepletron" className="cursor-text">
          🎲
        </Link>
      </p>
    </main>
  );
}
