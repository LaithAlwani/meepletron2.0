"use client";

import Link from "next/link";
import { useConvexAuth } from "convex/react";
import { ArrowRight } from "lucide-react";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { usePreferences, DESTINATION_HREF } from "@/lib/usePreferences";

const DEST_LABEL: Record<string, string> = {
  boardgames: "the library",
  chats: "chats",
  profile: "your profile",
};

/**
 * Hero call-to-action. During SSR and for signed-out visitors it renders the
 * sign-up CTAs (so the landing stays crawlable); once the client confirms an
 * authenticated session it swaps to a single "Go to …" button pointing at the
 * user's chosen default destination. `compact` shows just the primary CTA
 * (used by the closing card).
 */
export function HeroCta({ compact = false }: { compact?: boolean }) {
  const { isAuthenticated } = useConvexAuth();
  const { defaultDestination } = usePreferences();

  if (isAuthenticated) {
    return (
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={DESTINATION_HREF[defaultDestination]}
          className={buttonClasses("primary", "lg")}
        >
          Go to {DEST_LABEL[defaultDestination]}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Link href="/auth" className={buttonClasses("primary", "lg")}>
          Create free account
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
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
    </>
  );
}
