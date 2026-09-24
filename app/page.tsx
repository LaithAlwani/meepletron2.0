import type { Metadata } from "next";
import { Landing } from "@/components/home/Landing";
import { SignedInRedirect } from "@/components/home/SignedInRedirect";

const description =
  "Meepletron is an AI board game rules expert: ask any rules question and get an answer pulled from that game's actual rulebook, cited by page — not guessed from a general AI. Plus a game library, plays feed, stats and top-games lists.";

export const metadata: Metadata = {
  title: { absolute: "Meepletron — AI board game rules, answered from the rulebook" },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Meepletron — AI board game rules, answered from the rulebook",
    description,
    url: "/",
    type: "website",
  },
};

/**
 * The home route. `Landing` is server-rendered for everyone (so its H1 + AI copy
 * are in the initial HTML for crawlers and LLMs); {@link SignedInRedirect} then
 * sends signed-in visitors on to the Library.
 */
export default function HomePage() {
  return (
    <>
      <SignedInRedirect />
      <Landing />
    </>
  );
}
