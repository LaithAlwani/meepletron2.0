import type { Metadata } from "next";
import { WhoGoesFirst } from "@/components/who-goes-first/WhoGoesFirst";

const title = "First player";
const description =
  "Can't decide who starts? Everyone holds a finger on the screen and after three seconds one player is randomly picked to go first. A free, fair first-player picker for board game night.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "first player picker",
    "who goes first",
    "board game randomizer",
    "chwazi",
    "finger chooser",
    "random player selector",
    "board game night",
  ],
  alternates: { canonical: "/first-player" },
  openGraph: {
    title: `${title} · Meepletron`,
    description,
    url: "/first-player",
    type: "website",
  },
};

export default function FirstPlayerPage() {
  return <WhoGoesFirst />;
}
