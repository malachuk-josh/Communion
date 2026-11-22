"use client";

// Listens, from the moment the page loads, for a browser offering to install
// Communion (lib/install). The offer comes once, early, on whatever page the
// reader happened to open — so it is caught here, in the layout, and kept
// for the Home banner or the welcome page to use when a button asks.

import "@/lib/install";

export default function InstallWatch() {
  return null;
}
