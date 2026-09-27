import Image from "next/image";
import {
  LayoutGrid,
  Bookmark,
  MessageCircle,
  Crown,
  MessageCircleQuestion,
  type LucideIcon,
} from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { HeroBackdrop } from "@/components/home/HeroBackdrop";
import { HeroCta } from "@/components/home/HeroCta";

// The AI rules expert is the hero; these are everything else around the table.
const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: LayoutGrid,
    title: "A game library",
    body: "Browse the catalogue, open any game's rules, reference, and rulebook chat.",
  },
  {
    icon: MessageCircle,
    title: "Rulebook chat",
    body: "Ask any rules question and get an answer from the actual rulebook, cited by page.",
  },
  {
    icon: Bookmark,
    title: "Your collection",
    body: "Keep what you own, your wishlist, and what's up for sale — synced from BoardGameGeek.",
  },
  {
    icon: Crown,
    title: "First player",
    body: "Settle who starts with a tap — everyone holds a finger, one is chosen.",
  },
];

/** The signed-out home — a marketing landing that converts to sign-up. */
export function Landing() {
  return (
    <div className="relative overflow-hidden">
      <HeroBackdrop />

      {/* Hero — leads with the AI rules expert. */}
      <section className="mx-auto max-w-3xl px-4 pb-10 pt-16 text-center sm:pt-24">
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
          Meepletron reads the game&apos;s actual rulebook and answers your
          question in seconds — quoting the exact rule with the page it came
          from, not a guess from a general AI. Plus a game library, your
          collection, and a first-player picker for game night.
        </p>
        <HeroCta />
      </section>

      {/* Everything else for game night */}
      <section className="mx-auto max-w-4xl px-4 pb-20">
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
            Free to join. Your library, collection and chats are yours to keep.
          </p>
          <HeroCta compact />
        </Reveal>
      </section>
    </div>
  );
}
