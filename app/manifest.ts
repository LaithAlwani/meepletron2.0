import type { MetadataRoute } from "next";

const SIZES = [72, 96, 128, 144, 152, 192, 256, 384, 512] as const;

export default function manifest(): MetadataRoute.Manifest {
  const icons = SIZES.map((s) => ({
    src: `/icons/icon-${s}x${s}.webp`,
    sizes: `${s}x${s}`,
    type: "image/webp",
    purpose: "any" as const,
  }));

  return {
    // Chrome prints `name` under the icon on the Android splash screen, so keep
    // it to the wordmark — the descriptive version wrapped onto three lines.
    // `description` still carries the explanation for install prompts/listings.
    name: "Meepletron",
    short_name: "Meepletron",
    description:
      "Chat with an AI that answers board game rules questions, grounded in the actual rulebook with citations.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // The splash screen paints this behind the icon, and the icons carry the
    // same cream, so the launch screen reads as one light surface.
    background_color: "#faf6ee",
    theme_color: "#191512",
    categories: ["games", "reference", "utilities"],
    // No "maskable" variant: the icons are padded, but the manual still reaches
    // the bottom corners of the art, which a circular mask would clip. "any"
    // shows the whole logo. See scripts/generateIcons.mjs.
    icons,
  };
}
