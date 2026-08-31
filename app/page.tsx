import type { Metadata } from "next";
import { HomeScreen } from "@/components/home/HomeScreen";

const description =
  "Log your board-game plays, track your stats, settle rules with AI, rank your favourites and keep your collection — with the people you play with.";

export const metadata: Metadata = {
  title: { absolute: "Meepletron — Board game night, shared" },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Meepletron — Board game night, shared",
    description,
    url: "/",
    type: "website",
  },
};

export default function HomePage() {
  return <HomeScreen />;
}
