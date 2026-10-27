// The demo, at an address of its own.
//
// This is the page the share button hands out. Somebody arriving from a
// social feed gets the tour without the app asking anything of them first —
// the wordmark, the six screens, and a door into the reader. The metadata
// below is most of the point: it is what makes the link unfurl on a feed as
// a picture of the app instead of a bare URL.
//
// It follows the viewer's theme like every other page; the card image is the
// dark one, because a feed shows one picture to everybody.

import type { Metadata } from "next";
import TourPageBody from "@/components/TourPage";

export const metadata: Metadata = {
  title: "Communion — a tour in six screens",
  description:
    "A Bible app for reading and studying the Word. The whole Bible with word-level study tools, a journal and reading plans. See it in six screens.",
  openGraph: {
    title: "Communion — Read the Word. Gather in His name.",
    description:
      "The whole Bible with word-level study tools, and a journal for what you find. A tour in six screens.",
    images: ["/tour/og.jpg"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Communion — Read the Word. Gather in His name.",
    description:
      "The whole Bible with word-level study tools, and a journal for what you find. A tour in six screens.",
    images: ["/tour/og.jpg"],
  },
};

export default function TourPage() {
  return <TourPageBody />;
}
