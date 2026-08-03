import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Be right back",
  description: "Meepletron is leveling up. Back soon — smarter and tidier.",
};

export default function MaintenancePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <Image
        src="/logo.webp"
        alt="Meepletron"
        width={128}
        height={160}
        priority
        className="mb-8 h-28 w-auto drop-shadow-lg"
      />

      <h1 className="animate-in max-w-2xl text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
        Meepletron is re-rolling{" "}
        {/* The die is the secret door — no visible tell; those who know click it. */}
        <Link
          href="/boardgames"
          aria-label="Enter Meepletron"
          className="cursor-text"
        >
          🎲
        </Link>
      </h1>

      <p
        className="animate-in mt-4 max-w-xl text-balance text-lg text-muted"
        style={{ animationDelay: "100ms" }}
      >
        We hit pause to shuffle in some upgrades — a sharper brain, a tidier
        rulebook library, and fewer bugs (the software kind, not the ones you
        find under the couch cushions with the missing meeple).
      </p>

      <p
        className="animate-in mt-3 max-w-md text-balance text-sm text-subtle"
        style={{ animationDelay: "200ms" }}
      >
        Refill the dice tower and grab a snack — we&apos;ll be back before your
        turn. And no, we didn&apos;t lose the rulebook. We&apos;re just{" "}
        <em>actually reading it</em> this time.
      </p>

      <div
        className="animate-in mt-9 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-medium text-muted"
        style={{ animationDelay: "320ms" }}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        Reshuffling the deck…
      </div>
    </main>
  );
}
