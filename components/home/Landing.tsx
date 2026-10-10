import Image from "next/image";
import {
  Package,
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

// What's live alongside the rules expert. Keep this honest — a card here is a
// promise the signed-up visitor can hold us to on their first session.
const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Package,
    title: "Your collection",
    body: "Keep what you own, your wishlist, what you've parted with and what's up for sale — or sync the whole thing from BoardGameGeek in Settings and let it stay current on its own.",
  },
  {
    icon: Crown,
    title: "Settle who goes first",
    body: "A first-player picker for when nobody can agree, so the night starts instead of stalling on the oldest argument in board games.",
  },
];

/** The signed-out home — a marketing landing that converts to sign-up. */
export function Landing() {
  return (
    <div className="relative overflow-hidden">
      <HeroBackdrop />

      {/* Hero — leads with the AI rules expert. On desktop the live example
          sits to the right of the pitch; on mobile it stacks beneath it. */}
      <section className="mx-auto max-w-6xl px-4 pb-14 pt-16 sm:pt-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="text-center">
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
          </div>

          {/* Proof — the thing itself, before any claims about it. */}
          <Reveal>
            <AnswerDemo />
          </Reveal>
        </div>
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
            The rules expert is the heart of it — here&apos;s what else is
            ready to use today.
          </p>
        </Reveal>
        <Stagger
          as="ul"
          className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2"
        >
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
        <Reveal className="mx-auto mt-8 max-w-3xl rounded-2xl border border-accent/30 bg-accent/8 p-6 text-center sm:p-8">
          <p className="font-display text-xl font-extrabold sm:text-2xl">
            Stop passing the rulebook around
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
            Free to join. Ask your first rules question in under a minute.
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
              Once the rules were covered, the rest followed naturally: a place
              to keep the collection you play from, and to settle who goes
              first when nobody can agree.
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
