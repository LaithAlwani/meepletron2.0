import Image from "next/image";
import {
  Dices,
  BarChart3,
  Trophy,
  Package,
  Users,
  Crown,
  BookOpenCheck,
  Quote,
  ListTree,
  Layers,
  MessageCircleQuestion,
  type LucideIcon,
} from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { HeroBackdrop } from "@/components/home/HeroBackdrop";
import { HomeCta } from "@/components/home/HomeCta";
import { AnswerDemo } from "@/components/home/AnswerDemo";
import ContactForm from "@/components/ContactForm";

// Why an answer can be trusted — the actual mechanics, not adjectives. This is
// the part that separates Meepletron from asking a general chatbot.
const ACCURACY: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: BookOpenCheck,
    title: "It reads the rulebook",
    body: "Answers are built from the manual indexed for that specific game — not from half-remembered forum posts. Ask about a rule the book doesn't cover and it says so instead of inventing one.",
  },
  {
    icon: Quote,
    title: "Every answer shows its work",
    body: "Each claim carries a numbered citation. Tap it and the passage opens inline, with the section it came from, so you can check the wording before anyone argues about it.",
  },
  {
    icon: ListTree,
    title: "Parsed, not just skimmed",
    body: "Ingestion keeps the rulebook's structure — sections, headings, pages, tables and the symbols the rules lean on — so a question lands on the right rule, not merely a paragraph that looks right.",
  },
  {
    icon: Layers,
    title: "Expansions included",
    body: "Play with expansions and their manuals are searched too. Each citation is labelled with the book it came from, so you always know which one the answer is quoting.",
  },
];

// Everything around the table, once the rules argument is settled.
const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Dices,
    title: "Log your plays",
    body: "Competitive, co-op, teams, rounds or one-vs-all — record the scores, which expansions were on the table, photos from the night, and players who aren't on Meepletron yet.",
  },
  {
    icon: BarChart3,
    title: "Stats that build themselves",
    body: "Win rates, most-played games, head-to-head records and your play history — charted from the plays you log, with nothing extra to fill in.",
  },
  {
    icon: Trophy,
    title: "Top Games lists",
    body: "Drag your favourites into a ranked list, see it as a row of covers, and share it — or keep several lists for different moods and player counts.",
  },
  {
    icon: Package,
    title: "Your collection",
    body: "Owned, wishlist, previously owned and up for sale, in one place — or sync the whole thing from BoardGameGeek in Settings and let it keep itself current.",
  },
  {
    icon: Users,
    title: "Play with friends",
    body: "Add the people you play with, tag them in plays, and comment on each other's game nights as they get logged.",
  },
  {
    icon: Crown,
    title: "Settle who goes first",
    body: "A first-player picker for when nobody can agree, so the night starts instead of stalling.",
  },
];

/** The signed-out home — a marketing landing that converts to sign-up. */
export function Landing() {
  return (
    <div className="relative overflow-hidden">
      <HeroBackdrop />

      {/* Hero — leads with the AI rules expert. */}
      <section className="mx-auto max-w-5xl px-4 pb-8 pt-16 text-center sm:pt-24">
        <Image
          src="/logo.webp"
          alt="Meepletron"
          width={128}
          height={160}
          priority
          quality={90}
          className="animate-in mx-auto h-14 w-auto"
        />
        <p className="animate-in mt-5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-accent">
          <MessageCircleQuestion className="h-4 w-4" />
          AI board game rules expert
        </p>
        <h1 className="animate-in font-display mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
          Ask any board game rule — answered from the rulebook.
        </h1>
        <p className="animate-in mx-auto mt-4 max-w-xl text-balance text-base text-muted sm:text-lg">
          Meepletron reads the game&apos;s actual rulebook and answers in
          seconds, quoting the exact rule and the section it came from. Not a
          guess from a general AI — an answer you can check at the table.
        </p>
        <HomeCta />
      </section>

      {/* Proof — the thing itself, before any claims about it. */}
      <section className="mx-auto max-w-5xl px-4 pb-14">
        <Reveal>
          <AnswerDemo />
        </Reveal>
      </section>

      {/* How the accuracy is actually achieved. */}
      <section className="mx-auto max-w-5xl px-4 pb-20">
        <Reveal className="mb-6 text-center">
          <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            Why the answers hold up
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
            Ask a general chatbot a rules question and you get a confident
            answer with nothing behind it. Meepletron is built the other way
            round — the source comes first, and the answer has to come from it.
          </p>
        </Reveal>
        <Stagger as="ul" className="grid gap-3 sm:grid-cols-2">
          {ACCURACY.map((a) => {
            const Icon = a.icon;
            return (
              <StaggerItem
                as="li"
                key={a.title}
                className="rounded-2xl border border-accent/25 bg-surface/80 p-5 backdrop-blur"
              >
                <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/12 text-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="font-display font-bold">{a.title}</p>
                <p className="mt-1 text-sm text-muted">{a.body}</p>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>

      {/* Everything else for game night */}
      <section className="mx-auto max-w-5xl px-4 pb-20">
        <Reveal className="mb-6 text-center">
          <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            Everything else for game night
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            The rules expert is just the start — Meepletron keeps the rest of
            your table together too.
          </p>
        </Reveal>
        <Stagger as="ul" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <StaggerItem
                as="li"
                key={f.title}
                className="rounded-2xl border border-border-muted bg-surface/80 p-5 backdrop-blur"
              >
                <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/12 text-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="font-display font-bold">{f.title}</p>
                <p className="mt-1 text-sm text-muted">{f.body}</p>
              </StaggerItem>
            );
          })}
        </Stagger>

        {/* Closing CTA */}
        <Reveal className="mt-8 rounded-2xl border border-accent/30 bg-accent/8 p-6 text-center sm:p-8">
          <p className="font-display text-xl font-extrabold sm:text-2xl">
            Settle the rules, then keep the whole game night
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
            Free to join. Your plays, stats and lists are yours to keep.
          </p>
          <HomeCta closing />
        </Reveal>
      </section>

      {/* About — moved here from the old /about page. Always shown. */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <Reveal className="rounded-2xl border border-border bg-surface/60 p-6 backdrop-blur sm:p-8">
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
              place to log what you played, keep your collection, and settle who
              goes first, with the people you play with.
            </p>
          </div>
        </Reveal>
      </section>

      <div className="mx-auto max-w-5xl">
        <ContactForm />
      </div>
    </div>
  );
}
