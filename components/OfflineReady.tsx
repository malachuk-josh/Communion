"use client";

// Registers the service worker on every visit — it is what makes the app
// open with no signal. Push registration used to be the only thing that
// installed it, which meant a reader who never enabled notifications had no
// offline support at all.

import { useEffect } from "react";

export default function OfflineReady() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // after load, so registration never competes with first paint
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // unsupported or blocked (private mode) — the app still works online
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
