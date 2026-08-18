"use client";

import { useState, type ReactNode } from "react";
import { CircleUser } from "lucide-react";

/**
 * Avatar content (image, first initial, or a profile icon) for a caller-styled
 * circle. Renders the image only while it loads cleanly — a broken/expired URL
 * (common with OAuth `image` links) falls back to the initial or icon instead of
 * a broken-image glyph. Tracks the failed src (not a boolean) so a later,
 * different url still gets a chance to load.
 */
export function AvatarImg({
  src,
  initial,
  icon,
}: {
  src?: string | null;
  initial?: string;
  icon?: ReactNode;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && failedSrc !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        onError={() => setFailedSrc(src)}
        className="h-full w-full object-cover"
      />
    );
  }
  if (icon) return <>{icon}</>;
  if (initial) return <>{initial}</>;
  return <CircleUser className="h-3/5 w-3/5" />;
}
