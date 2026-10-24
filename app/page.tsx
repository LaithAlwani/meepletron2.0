import type { Metadata } from "next";
import { Landing } from "@/components/home/Landing";

const title =
  "Meepletron — an AI rules referee that answers only from the rulebook";

const description =
  "Ask a board game rules question mid-game and get the answer straight from that game's actual manual, cited by page so you can check it. If the rulebook doesn't cover it, Meepletron says so — it won't guess, won't coach strategy, and won't fill gaps from general knowledge.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { title, description, url: "/", type: "website" },
};

/**
 * The home route — the marketing landing, server-rendered for everyone (so its
 * H1 + AI copy are in the initial HTML for crawlers and LLMs). Signed-in users
 * stay here too; the landing shows them app CTAs instead of the sign-up ones.
 */
export default function HomePage() {
  return <Landing />;
}
