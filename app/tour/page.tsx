// The demo, at an address of its own.
//
// This is the page the share button hands out. Somebody arriving from a
// social feed gets the tour without the app asking anything of them first —
// the wordmark, the ten screens, and a door into the reader. The metadata
// below is most of the point: it is what makes the link unfurl on a feed as
// a picture of the app instead of a bare URL.
//
// It follows the viewer's theme like every other page; the card image is the
// dark one, because a feed shows one picture to everybody.

import type { Metadata } from "next";
import TourPageBody from "@/components/TourPage";

export const metadata: Metadata = {
  title: "Communion — a tour in ten screens",
  description:
    "A Bible app with a social heart. The whole Bible with word-level study tools, and Gatherings — small groups that worship together. See it in ten screens.",
  openGraph: {
    title: "Communion — Read the Word. Gather in His name.",
    description:
      "The whole Bible with word-level study tools, and Gatherings that really meet. A tour in ten screens.",
    images: ["/tour/og.jpg"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Communion — Read the Word. Gather in His name.",
    description:
      "The whole Bible with word-level study tools, and Gatherings that really meet. A tour in ten screens.",
    images: ["/tour/og.jpg"],
  },
};

export default function TourPage() {
  return <TourPageBody />;
}
