"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useQuery,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import {
  Dices,
  BarChart3,
  Trophy,
  Package,
  Users,
  CircleUser,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { buttonClasses } from "@/components/ui/Button";

/**
 * The profile now lives at /user/[username]. Signed in, this route forwards
 * there (or to Settings if you haven't picked a username). Signed out, it shows
 * a preview of what a profile holds, to nudge sign-up.
 */
export default function ProfileRoute() {
  return (
    <>
      <AuthLoading>
        <div className="px-4 py-16 text-center text-sm text-muted">Loading…</div>
      </AuthLoading>
      <Authenticated>
        <ProfileRedirect />
      </Authenticated>
      <Unauthenticated>
        <SignedOutTeaser />
      </Unauthenticated>
    </>
  );
}

function ProfileRedirect() {
  const router = useRouter();
  const me = useQuery(api.users.me);

  useEffect(() => {
    if (me === undefined) return; // still loading the profile
    router.replace(me?.username ? `/user/${me.username}` : "/settings");
  }, [me, router]);

  return (
    <div className="px-4 py-16 text-center text-sm text-muted">Loading…</div>
  );
}

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Dices,
    title: "Plays",
    body: "Log every game night — scores, winners, photos and who was at the table.",
  },
  {
    icon: BarChart3,
    title: "Stats",
    body: "Win rates, most-played games and your play history at a glance.",
  },
  {
    icon: Trophy,
    title: "Top Games lists",
    body: "Rank your all-time favourites into shareable Top Games lists.",
  },
  {
    icon: Package,
    title: "Collection",
    body: "Show the games you own, your wishlist, and what's up for trade.",
  },
];

function SignedOutTeaser() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {/* Faux profile header — a peek at the real thing */}
      <div className="flex items-center gap-5 sm:gap-8">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-surface-2 text-subtle sm:h-24 sm:w-24">
          <CircleUser className="h-12 w-12" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-xl font-extrabold tracking-tight">
            Your profile
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Your game nights, all in one place.
          </p>
          <div className="mt-3 flex gap-6 text-sm text-muted">
            <span>
              <b className="text-foreground">0</b> plays
            </span>
            <span>
              <b className="text-foreground">0</b> lists
            </span>
            <span>
              <b className="text-foreground">0</b> friends
            </span>
          </div>
        </div>
      </div>

      {/* Sign-up call to action */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-accent/30 bg-accent/8">
        <div className="p-5 text-center sm:p-6">
          <p className="font-display text-lg font-extrabold sm:text-xl">
            Sign in to start your collection of game nights
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Create a free account to log plays, track your stats, build Top
            Games lists and add friends — it&apos;s all yours to keep.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <Link href="/auth" className={buttonClasses("primary", "md")}>
              Create free account
            </Link>
            <Link href="/auth" className={buttonClasses("ghost", "md")}>
              Log in
            </Link>
          </div>
        </div>
      </div>

      {/* What you get — a preview of the tabs */}
      <p className="mb-2 mt-8 px-1 text-xs font-semibold uppercase tracking-widest text-subtle">
        What&apos;s on your profile
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <li
              key={f.title}
              className="rounded-2xl border border-border-muted bg-surface p-4"
            >
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-accent/12 text-accent">
                <Icon className="h-5 w-5" />
              </div>
              <p className="font-semibold">{f.title}</p>
              <p className="mt-0.5 text-sm text-muted">{f.body}</p>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted">
        <Users className="h-4 w-4" />
        Already have an account?{" "}
        <Link href="/auth" className="font-semibold text-accent hover:underline">
          Log in
        </Link>
      </div>
    </div>
  );
}
