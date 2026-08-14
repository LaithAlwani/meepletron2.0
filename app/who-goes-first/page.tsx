import type { Metadata } from "next";
import { WhoGoesFirst } from "@/components/who-goes-first/WhoGoesFirst";

const title = "Who Goes First?";
const description =
  "Can't decide who starts? Everyone holds a finger on the screen and after three seconds one player is randomly picked to go first. A free, fair first-player picker for board game night.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "who goes first",
    "first player picker",
    "board game randomizer",
    "chwazi",
    "finger chooser",
    "random player selector",
    "board game night",
  ],
  alternates: { canonical: "/who-goes-first" },
  openGraph: {
    title: `${title} · Meepletron`,
    description,
    url: "/who-goes-first",
    type: "website",
  },
};

export default function WhoGoesFirstPage() {
  return <WhoGoesFirst />;
}
