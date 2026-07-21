import type { Metadata } from "next";
import { LandingPage } from "@/components/landing-page";

export const metadata: Metadata = {
  title: "RamerLabs Poker — Live Texas Hold'em Tables",
  description:
    "Play free credit lobbies or host private real-money Texas Hold'em rooms. Live sync, mobile portrait mode, wallets, clubs, and table reactions.",
  openGraph: {
    title: "RamerLabs Poker",
    description:
      "Premium Texas Hold'em — credits tables, real-money private rooms, and mobile-first play.",
    url: "https://poker.ramerlabs.com",
    siteName: "RamerLabs Poker",
    type: "website",
  },
};

export default function HomePage() {
  return <LandingPage />;
}
