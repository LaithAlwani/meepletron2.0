import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  MessageCircle,
  LayoutGrid,
  Dices,
  Trophy,
  Hand,
  Scissors,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/buttonStyles";
import ContactForm from "@/components/ContactForm";

const description =
  "Meepletron is a home for board-game nights: an AI rules referee that answers from the actual rulebook, a game library, a feed to share your plays and top-games lists, and handy table tools.";

export const metadata: Metadata = {
  title: "About Meepletron",
  description,
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Meepletron",
    description,
    url: "/about",
    type: "website",
  },
};

const FEATURES = [
  {
    icon: MessageCircle,
    title: "An AI rules referee",
    body: "Ask a rules question the way you'd say it at the table and get a straight answer, quoted from the rulebook with the page it came from.",
  },
  {
    icon: LayoutGrid,
    title: "A game library",
    body: "Browse games, sync your collection, and keep your shelf in one place.",
  },
  {
    icon: Dices,
    title: "A plays feed",
    body: "Log the games you play, share them as posts, and see what your friends are playing.",
  },
  {
    icon: Trophy,
    title: "Top Games lists",
    body: "Rank your favourites each year, compare with last year, and share the list.",
  },
  {
    icon: Hand,
    title: "Who goes first",
    body: "Settle the first-player argument with a tap — everyone holds a finger, one is chosen.",
  },
  {
    icon: Scissors,
    title: "Tuckbox designer",
    body: "Design and print a custom box for your cards, sized to fit.",
  },
];

export default function AboutPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Soft aurora wash behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[80vh] overflow-hidden"
      >
        <div
          className="aurora absolute -left-24 top-[-10%] h-80 w-80 rounded-full bg-accent/20 blur-3xl"
          style={{ ["--aurora-dur"]: "22s" } as CSSProperties}
        />
        <div
          className="aurora absolute -right-24 top-1/4 h-96 w-96 rounded-full bg-accent-2/15 blur-3xl"
          style={{ ["--aurora-dur"]: "26s", animationDelay: "2s" } as CSSProperties}
        />
      </div>

      {/* ---------- Hero / mission ---------- */}
      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pb-10 pt-16 text-center sm:pt-20">
        <Image
          src="/logo.webp"
          alt="Meepletron"
          width={112}
          height={140}
          priority
          className="mb-6 h-20 w-auto drop-shadow-xl sm:h-24"
        />
        <h1 className="font-display text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
          Made for game night
        </h1>
        <p className="mt-4 text-balance text-lg text-muted sm:text-xl">
          Meepletron started as one thing — an AI referee that answers rules
          questions from the actual rulebook, so nobody has to flip back through
          it mid-game. It grew into a home for everything around the table.
        </p>
      </section>

      {/* ---------- Why it exists ---------- */}
      <section className="mx-auto max-w-3xl px-6 pb-14">
        <div className="rounded-2xl border border-border bg-surface/60 p-6 backdrop-blur sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
            Why it exists
          </p>
          <div className="mt-3 space-y-4 text-base leading-relaxed text-muted">
            <p>
              Every group has that moment: a rule comes up, someone&apos;s sure
              they remember it, someone else isn&apos;t, and the game stops while
              the rulebook gets passed around. Meepletron answers the question in
              seconds — in the rulebook&apos;s own words, with a citation you can
              check before anyone argues about it.
            </p>
            <p>
              Once the game night was covered, the rest followed naturally: a
              place to keep your collection, log the plays you finish, rank your
              favourites, and share it all with the people you play with.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- What you can do ---------- */}
      <section className="mx-auto max-w-3xl px-6 pb-16">
        <h2 className="font-display mb-6 text-center text-2xl font-extrabold tracking-tight sm:text-3xl">
          What you can do here
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="rounded-2xl border border-border bg-surface p-5"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/12 text-accent">
                  <Icon className="h-5.5 w-5.5" />
                </div>
                <h3 className="font-display mt-4 text-lg font-bold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {f.body}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className={buttonClasses("primary", "lg")}>
            Go to the feed
          </Link>
          <Link href="/boardgames" className={buttonClasses("ghost", "lg")}>
            Browse the library
          </Link>
        </div>
      </section>

      {/* ---------- Contact ---------- */}
      <div className="mx-auto max-w-3xl">
        <ContactForm />
      </div>
    </div>
  );
}
