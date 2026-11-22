// The page a shared link opens: what Communion is, and how to put it on this
// phone's Home Screen — the steps for this phone, in this browser, on the
// page itself rather than behind a button (components/GetPage).
//
// The metadata is what the link unfurls into in a message or a feed, which
// for somebody who has never heard of Communion is the first thing they see.

import type { Metadata } from "next";
import GetPage from "@/components/GetPage";

const title = "Communion — Read the Word. Study the Word.";
const description =
  "A free Bible app for your phone: the whole Bible with the Hebrew and Greek a tap away, maps, commentaries and reading plans. Add it to your Home Screen — no App Store needed.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: ["/og.png"], type: "website" },
  twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
};

export default function Get() {
  return <GetPage />;
}
