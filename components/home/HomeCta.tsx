"use client";

import Link from "next/link";
import { useConvexAuth } from "convex/react";
import { ArrowRight, LayoutGrid, Package } from "lucide-react";
import { buttonClasses } from "@/components/ui/buttonStyles";

/**
 * Home-page call-to-action. During SSR and for signed-out visitors it renders
 * the sign-up CTAs (so the landing stays crawlable); once the client confirms a
 * signed-in session it swaps to app entry points (browse the library / your
 * collection). `closing` renders the compact single-button variant used by the
 * closing card.
 */
export function HomeCta({ closing = false }: { closing?: boolean }) {
  const { isAuthenticated } = useConvexAuth();

  if (isAuthenticated) {
    return (
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link href="/boardgames" className={buttonClasses("primary", "lg")}>
          <LayoutGrid className="h-4.5 w-4.5" />
          Browse the library
        </Link>
        {!closing && (
          <Link
            href="/boardgames/collection/owned"
            className={buttonClasses("ghost", "lg")}
          >
            <Package className="h-4.5 w-4.5" />
            Your collection
          </Link>
        )}
      </div>
    );
  }

  // Signed out (and SSR / crawlers) — unchanged from the original landing.
  if (closing) {
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
}
