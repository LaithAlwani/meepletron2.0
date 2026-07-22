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
    name: "Meepletron — Board game rules assistant",
    short_name: "Meepletron",
    description:
      "Chat with an AI that answers board game rules questions, grounded in the actual rulebook with citations.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    categories: ["games", "reference", "utilities"],
    icons: [
      ...icons,
      // Maskable variant so Android crops it into the adaptive-icon shape.
      {
        src: "/icons/icon-512x512.webp",
        sizes: "512x512",
        type: "image/webp",
        purpose: "maskable",
      },
    ],
  };
}
