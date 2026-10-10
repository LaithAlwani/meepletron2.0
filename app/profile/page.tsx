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
  MessageCircle,
  LayoutGrid,
  Package,
  Hand,
  Users,
  CircleUser,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { buttonClasses } from "@/components/ui/Button";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

/**
 * The profile lives at /user/[username]. Signed in, this route forwards there —
 * or, if you haven't picked a username yet, shows your account/settings inline
 * so you can set one. Signed out, it shows a sign-up nudge.
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
    if (me?.username) router.replace(`/user/${me.username}`);
  }, [me, router]);

  if (me === undefined || me?.username) {
    return (
      <div className="px-4 py-16 text-center text-sm text-muted">Loading…</div>
    );
  }

  // No username yet — show the account/settings panel so they can set one.
  return (
    <div className="mx-auto max-w-site px-4 pb-8 pt-3 nav:pt-8">
      <h1 className="font-display mb-6 hidden nav:block text-2xl font-extrabold tracking-tight">
        Your account
      </h1>
      <SettingsPanel />
    </div>
  );
}

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: MessageCircle,
    title: "Rulebook chat",
    body: "Ask any rules question and get an answer from the actual rulebook, cited by page.",
  },
  {
    icon: LayoutGrid,
    title: "Game library",
    body: "Browse games and open any game's rules, reference, and rulebook chat.",
  },
  {
    icon: Package,
    title: "Collection",
    body: "Keep the games you own, your wishlist, and what's up for sale in one place.",
  },
  {
    icon: Hand,
    title: "First player",
    body: "Settle who starts with a tap — everyone holds a finger, one is chosen.",
  },
];

function SignedOutTeaser() {
  return (
    <div className="mx-auto max-w-site px-4 pb-10 pt-3 nav:pt-10">
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
            Your board game night, all in one place.
          </p>
        </div>
      </div>

      {/* Sign-up call to action */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-accent/30 bg-accent/8">
        <div className="p-5 text-center sm:p-6">
          <p className="font-display text-lg font-extrabold sm:text-xl">
            Sign in to keep your games and rulebook chats
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Create a free account to build your collection and keep your rulebook
            chats — it&apos;s all yours to keep.
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

      {/* What you get */}
      <p className="mb-2 mt-8 px-1 text-xs font-semibold uppercase tracking-widest text-subtle">
        What you get
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
