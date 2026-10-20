"use client";

import { useEffect, useRef, useState } from "react";
import { CoverMorph, coverTransitionName } from "./coverMorph";

/**
 * Width the detail hero reserves for the cover. Fixed (rather than sized by
 * the image's natural width) so the info column doesn't shift when the image
 * lands — before it loads the box is simply clear. Height follows the cover's
 * own aspect ratio; MIN_H keeps the row from collapsing while it's empty.
 */
export const HERO_COVER_W = "w-44 sm:w-56";
const MIN_H = "min-h-48 sm:min-h-56";

/**
 * The detail page's cover: the shared-element target for the list thumbnail
 * morph (components/boardgames/coverMorph.tsx).
 *
 * Shows `thumb` (usually already cached from the list) immediately, and loads
 * the full `cover` at high priority on top of it, fading in once decoded — so
 * the space is never blank while the big image downloads.
 */
export function HeroCover({
  slug,
  cover,
  thumb,
  alt,
}: {
  slug: string;
  cover: string;
  /** Smaller version of the same image, shown until `cover` has loaded. */
  thumb?: string | null;
  alt: string;
}) {
  const layered = !!thumb && thumb !== cover;
  const fullRef = useRef<HTMLImageElement>(null);
  const [fullLoaded, setFullLoaded] = useState(false);
  // A cached full image can finish before React attaches onLoad.
  useEffect(() => {
    if (fullRef.current?.complete) setFullLoaded(true);
  }, [cover]);

  const imgCls =
    "block h-auto w-full rounded-2xl shadow-xl ring-1 ring-black/5 duration-300 group-hover:scale-[1.03]";

  return (
    <CoverMorph name={coverTransitionName(slug)}>
      <div className={`relative ${HERO_COVER_W} ${MIN_H}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={layered ? thumb! : cover}
          alt={alt}
          className={`${imgCls} transition-transform`}
          {...(layered ? {} : { fetchPriority: "high" as const })}
        />
        {layered && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={fullRef}
            src={cover}
            alt=""
            aria-hidden
            fetchPriority="high"
            onLoad={() => setFullLoaded(true)}
            className={`absolute left-0 top-0 ${imgCls} transition-[opacity,transform] ${
              fullLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
      </div>
    </CoverMorph>
  );
}
