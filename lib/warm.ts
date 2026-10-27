"use client";

// Filling the cupboard before the power cuts.
//
// The service worker keeps the last good answer for the read-only endpoints
// it is allowed to — but only for the ones that have actually been asked. A
// reader who opens the app, reads a psalm and gets on a plane has a cache with
// scripture in it and nothing else, and the wall on their home screen comes up
// empty because they never happened to open it with signal. Visiting a screen
// is what saves it, and nobody visits screens in order to save them.
//
// So while there is signal, ask for the few things the server holds that the
// device does not: the wall, the prayer list beside it, and the profile. The
// requests go through the worker like any other, so the answers land in the
// same cache and are already there the next time — with or without a network.
//
// It used to ask for a good deal more — every Gathering and what was inside
// it, the conversations at the Table, the calendar — and went with them. What
// is left is a few KB, never asked without a connection, and never more than
// once in a quarter of an hour.

import { api } from "@/lib/client";
import { readLocal, writeLocal } from "@/lib/storage";

/** How often this is worth doing at all. */
const EVERY = 15 * 60 * 1000;
/** Where the last run is remembered, so a reload is not a reason to re-run. */
const MARK = "communion.warmedAt";

let running = false;

const ok = (p: Promise<unknown>): Promise<unknown> => p.catch(() => null);

function due(): boolean {
  try {
    const last = Number(readLocal(MARK) ?? 0);
    return !Number.isFinite(last) || Date.now() - last > EVERY;
  } catch {
    // private mode with storage denied: warm every time rather than never
    return true;
  }
}

function mark(): void {
  try {
    writeLocal(MARK, String(Date.now()));
  } catch {
    // nothing to remember it with; the throttle is a courtesy, not a rule
  }
}

/**
 * Ask for the things worth having offline. Safe to call whenever — it returns
 * immediately if it is not due, if there is no worker to cache the answers, or
 * if there is nothing to ask over.
 */
export async function warmOffline(force = false): Promise<void> {
  if (running) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  // no worker means nothing would be stored, and the requests would be spent
  // for nothing
  if (!navigator.serviceWorker.controller) return;
  if (navigator.onLine === false) return;
  if (!force && !due()) return;

  running = true;
  try {
    // a miss is a miss, not a stop: offline halfway through, or signed out,
    // and what got through got through
    await Promise.all([
      ok(api("/api/wall")),
      ok(api("/api/wall/prayers")),
      ok(api("/api/profile")),
    ]);
    mark();
  } finally {
    running = false;
  }
}

/**
 * Warm now and whenever the moment is right: when a connection comes back,
 * and when the app is looked at again after being away. Returns the undo.
 */
export function startWarming(): () => void {
  const soon = () => {
    void warmOffline();
  };
  // not during the first paint — this is the least urgent thing the app does
  const idle =
    typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback(soon, { timeout: 8000 })
      : window.setTimeout(soon, 4000);

  const onVisible = () => {
    if (document.visibilityState === "visible") soon();
  };
  // a connection returning is the one moment this is worth doing regardless of
  // when it last ran: it is the difference between yesterday's copy and today's
  const onOnline = () => {
    void warmOffline(true);
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    if (typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(idle as number);
    } else {
      window.clearTimeout(idle as number);
    }
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
