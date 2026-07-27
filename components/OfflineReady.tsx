"use client";

// Registers the service worker on every visit — it is what makes the app
// open with no signal. Push registration used to be the only thing that
// installed it, which meant a reader who never enabled notifications had no
// offline support at all.

import { useEffect } from "react";
import { startWarming } from "@/lib/warm";

export default function OfflineReady() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let stop: (() => void) | undefined;
    // after load, so registration never competes with first paint
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // unsupported or blocked (private mode) — the app still works online
      });
      // Once there is a worker to store the answers, quietly fetch the
      // Gatherings and conversations this device would otherwise only hold if
      // the reader happened to have opened them before losing signal.
      navigator.serviceWorker.ready
        .then(() => {
          stop = startWarming();
        })
        .catch(() => {
          // no worker, nothing to warm into
        });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => stop?.();
  }, []);

  return null;
}
