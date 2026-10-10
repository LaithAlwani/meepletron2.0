import type { Metadata } from "next";
import { Landing } from "@/components/home/Landing";

const description =
  "Meepletron is an AI board game rules expert: ask any rules question and get an answer pulled from that game's actual rulebook, cited by page — not guessed from a general AI. Plus a game library, your collection and a first-player picker.";

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
 * The home route — the marketing landing, server-rendered for everyone (so its
 * H1 + AI copy are in the initial HTML for crawlers and LLMs). Signed-in users
 * stay here too; the landing shows them app CTAs instead of the sign-up ones.
 */
export default function HomePage() {
  return <Landing />;
}
