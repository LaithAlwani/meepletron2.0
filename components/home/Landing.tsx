import Image from "next/image";
import {
  Dices,
  BarChart3,
  Trophy,
  Package,
  MessageCircleQuestion,
  type LucideIcon,
} from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { HeroBackdrop } from "@/components/home/HeroBackdrop";
import { HomeCta } from "@/components/home/HomeCta";
import { LoggedOutOnly } from "@/components/home/LoggedOutOnly";
import ContactForm from "@/components/ContactForm";

// The AI rules expert is the hero; these are everything else around the table.
const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Dices,
    title: "Log your plays",
    body: "Record every game night — scores, winners, photos and who was at the table.",
  },
  {
    icon: BarChart3,
    title: "Track your stats",
    body: "Win rates, most-played games and your play history, updated automatically.",
  },
  {
    icon: Trophy,
    title: "Top Games lists",
    body: "Rank your all-time favourites into lists worth sharing.",
  },
  {
    icon: Package,
    title: "Your collection",
    body: "Keep what you own, your wishlist, and what's up for sale in one place.",
  },
  {
    icon: Dices,
    title: "Play with friends",
    body: "Add friends, tag them in plays, and see the game nights they share.",
  },
];

/** The signed-out home — a marketing landing that converts to sign-up. */
export function Landing() {
  return (
    <div className="relative overflow-hidden">
      <HeroBackdrop />

      {/* Hero — leads with the AI rules expert. */}
      <section className="mx-auto max-w-5xl px-4 pb-10 pt-16 text-center sm:pt-24">
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
          from, not a guess from a general AI. Plus a game library, a plays
          feed, stats and top-games lists for everything else around the table.
        </p>
        <HomeCta />
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

      {/* About — moved here from the old /about page; signed-out visitors only. */}
      <LoggedOutOnly>
        <section className="mx-auto max-w-5xl px-4 pb-16">
          <Reveal className="rounded-2xl border border-border bg-surface/60 p-6 backdrop-blur sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
              Why it exists
            </p>
            <div className="mt-3 space-y-4 text-base leading-relaxed text-muted">
              <p>
                Every group has that moment: a rule comes up, someone&apos;s sure
                they remember it, someone else isn&apos;t, and the game stops
                while the rulebook gets passed around. Meepletron answers the
                question in seconds — in the rulebook&apos;s own words, with a
                citation you can check before anyone argues about it.
              </p>
              <p>
                Once the game night was covered, the rest followed naturally: a
                place to keep your collection, log the plays you finish, rank
                your favourites, and share it all with the people you play with.
              </p>
            </div>
          </Reveal>
        </section>

        <div className="mx-auto max-w-5xl">
          <ContactForm />
        </div>
      </LoggedOutOnly>
    </div>
  );
}
