// Where Communion lives on the web, said once.
//
// Every link the app hands to someone else — an invitation, a QR code, the
// signature under a shared note, the tour, the card a link unfurls into —
// is built from this, so moving to a new address is one setting: set
// NEXT_PUBLIC_SITE_URL in the Vercel project (and redeploy), and every one of
// them follows. Until then, the address Vercel gave the project.

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://communion-mu.vercel.app"
).replace(/\/+$/, "");

/** The page a shared link opens on: what Communion is, and how to add it. */
export const GET_URL = `${SITE_URL}/get`;
