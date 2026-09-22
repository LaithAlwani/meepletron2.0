import Link from "next/link";
import Image from "next/image";
import {
  Dices,
  BarChart3,
  Sparkles,
  Trophy,
  Package,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { HeroBackdrop } from "@/components/home/HeroBackdrop";

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
    icon: Sparkles,
    title: "Ask the AI",
    body: "Settle any rules question with an assistant that knows the rulebook.",
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

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-4 pb-10 pt-16 text-center sm:pt-24">
        <Image
          src="/logo.webp"
          alt=""
          width={128}
          height={160}
          priority
          quality={90}
          className="animate-in mx-auto h-14 w-auto"
        />
        <p className="animate-in mt-5 text-xs font-bold uppercase tracking-[0.2em] text-accent">
          Board game night, shared
        </p>
        <h1 className="animate-in font-display mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Every game night, in one place.
        </h1>
        <p className="animate-in mx-auto mt-4 max-w-xl text-base text-muted sm:text-lg">
          Log your plays, track your stats, settle the rules with AI, rank your
          favourites, and keep your collection — with the people you play with.
        </p>
        <div className="animate-in mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link href="/auth" className={buttonClasses("primary", "lg")}>
            Create free account
          </Link>
          <Link href="/auth" className={buttonClasses("ghost", "lg")}>
            Log in
          </Link>
        </div>
        <Link
          href="/boardgames"
          className="animate-in mt-5 inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-foreground"
        >
          Just browsing? Explore the game library
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-4xl px-4 pb-20">
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
            Start your collection of game nights
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
            Free to join. Your plays, stats and lists are yours to keep.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link href="/auth" className={buttonClasses("primary", "lg")}>
              Create free account
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
