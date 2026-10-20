"use client";

import { ViewTransition, useEffect, useState, type ReactNode } from "react";

/**
 * Shared-element morph for game covers: a list thumbnail and the detail page's
 * hero carry the same view-transition name, so the browser animates one into
 * the other on navigation (see app/globals.css, `.cover-morph`).
 *
 * Two wrinkles this module handles:
 *
 * 1. A game can appear twice on one page (e.g. in search results and in a
 *    collection rail). Duplicate names abort the browser's transition, so a
 *    thumbnail only takes the name when it's actually navigated from — set on
 *    click — and `holders` guarantees one holder per slug.
 * 2. The detail page loads via Convex, so its hero doesn't exist when the
 *    navigation commits. The clicked thumbnail is remembered in `pending`, and
 *    the detail skeleton renders that image under the same name as a morph
 *    target until the real hero replaces it.
 */
let pending: { slug: string; cover: string } | null = null;
const holders = new Set<string>();

/** view-transition-name must be a CSS ident; slugs are already kebab-case. */
export function coverTransitionName(slug: string) {
  return `game-cover-${slug.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/** The cover of the thumbnail just clicked for `slug`, if that's how we got here. */
export function pendingCoverFor(slug: string): string | null {
  return pending?.slug === slug ? pending.cover : null;
}

export function CoverMorph({
  name,
  children,
}: {
  name?: string;
  children: ReactNode;
}) {
  return (
    <ViewTransition name={name} share="cover-morph" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * For list thumbnails. Returns the name to pass to <CoverMorph> (undefined
 * until the user navigates from this thumbnail) and the Link onClick that
 * arms it. Claims the name on mount when we're returning from this game's
 * detail page, so a back navigation can morph the hero into the thumbnail.
 */
export function useCoverMorph(slug: string, cover: string | null) {
  const [active, setActive] = useState(() => {
    if (!cover || pending?.slug !== slug || holders.has(slug)) return false;
    holders.add(slug);
    return true;
  });
  useEffect(() => {
    if (!active) return;
    holders.add(slug);
    return () => {
      holders.delete(slug);
    };
  }, [active, slug]);

  const onNavigate = () => {
    if (!cover) return;
    pending = { slug, cover };
    if (!active && !holders.has(slug)) {
      holders.add(slug);
      setActive(true);
    }
  };

  return { name: active ? coverTransitionName(slug) : undefined, onNavigate };
}
