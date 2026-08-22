import type { Metadata } from "next";
import { HomeFeed } from "@/components/feed/HomeFeed";

const description =
  "Share your board-game nights — plays, photos and Top Games lists — and see what everyone's playing on Meepletron.";

export const metadata: Metadata = {
  title: { absolute: "Meepletron — Board game night, shared" },
  description,
  alternates: { canonical: "/feed" },
  openGraph: {
    title: "Meepletron — Board game night, shared",
    description,
    url: "/feed",
    type: "website",
  },
};

export default function FeedPage() {
  return <HomeFeed />;
}
