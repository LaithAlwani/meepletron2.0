"use client";

import Link from "next/link";
import { useConvexAuth } from "convex/react";
import { ArrowRight, LayoutGrid, MessageCircle } from "lucide-react";
import { buttonClasses } from "@/components/ui/buttonStyles";

/**
 * Home-page call-to-action.
 *
 * SEO: the signed-out sign-up CTAs are ALWAYS in the server-rendered HTML
 * (crawlable). While auth is still resolving on the client they stay in the DOM
 * but are visually hidden behind a spinner — so a signed-in visitor never sees
 * the sign-up text flash before it swaps to the app entry points. Only once the
 * session is confirmed do we commit to a state. `closing` renders the compact
 * single-button variant used by the closing card.
 */
export function HomeCta({ closing = false }: { closing?: boolean }) {
  const { isLoading, isAuthenticated } = useConvexAuth();

  const signedIn = (
    <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
      <Link href="/boardgames" className={buttonClasses("primary", "lg")}>
        <LayoutGrid className="h-4.5 w-4.5" />
        Browse the library
      </Link>
      {!closing && (
        <Link href="/chats" className={buttonClasses("ghost", "lg")}>
          <MessageCircle className="h-4.5 w-4.5" />
          Chats
        </Link>
      )}
    </div>
  );

  const signedOut = closing ? (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
      <Link href="/auth" className={buttonClasses("primary", "lg")}>
        Create free account
      </Link>
    </div>
  ) : (
    <>
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
    </>
  );

  if (!isLoading) return isAuthenticated ? signedIn : signedOut;

  // Auth still resolving: keep the signed-out CTAs in the DOM (crawlable +
  // reserves the layout) but hidden, with button-shaped pulse placeholders over
  // the button row — so the sign-up text never flashes for a signed-in visitor.
  return (
    <div className="relative">
      <div aria-hidden className="invisible">
        {signedOut}
      </div>
      <div
        className={`absolute inset-0 flex items-start justify-center ${
          closing ? "pt-5" : "pt-7"
        }`}
      >
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="h-12 w-48 animate-pulse rounded-xl bg-surface-2" />
          {!closing && (
            <div className="h-12 w-28 animate-pulse rounded-xl bg-surface-2" />
          )}
        </div>
      </div>
    </div>
  );
}
