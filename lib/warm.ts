"use client";

// Filling the cupboard before the power cuts.
//
// The service worker keeps the last good answer for the read-only endpoints
// it is allowed to — but only for the ones that have actually been asked. A
// reader who opens the app, reads a psalm and gets on a plane has a cache with
// scripture in it and nothing else, and the Table and the Gatherings still
// come up empty. Visiting a screen is what saves it, and nobody visits screens
// in order to save them.
//
// So while there is signal, ask for the handful of things a person would be
// sorry to lose: their Gatherings and what is inside them, their
// conversations, the calendar. The requests go through the worker like any
// other, so the answers land in the same cache and are already there the next
// time — with or without a network.
//
// This is deliberately small. It is a few dozen KB of JSON against thirty
// megabytes of downloaded scripture, it never runs without a connection, and
// it never runs more than once in a quarter of an hour.

import { api } from "@/lib/client";

/** How often this is worth doing at all. */
const EVERY = 15 * 60 * 1000;
/** Where the last run is remembered, so a reload is not a reason to re-run. */
const MARK = "communion.warmedAt";

/**
 * Bounds. Someone in forty Gatherings with two hundred conversations should
 * not have their morning spent on this; the most recent are the ones they are
 * living in, and the rest still load when there is signal.
 */
const MAX_GATHERINGS = 12;
const MAX_CONVERSATIONS = 20;
/** Enough to keep a phone busy, not enough to fight the screen for bandwidth. */
const AT_ONCE = 4;

let running = false;

interface Church {
  id: string;
}
interface Conversation {
  peerId: string;
}

const ok = (p: Promise<unknown>): Promise<unknown> => p.catch(() => null);

/** Run `jobs` a few at a time; a failure is a miss, not a stop. */
async function pool(jobs: (() => Promise<unknown>)[]): Promise<void> {
  const queue = jobs.slice();
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await ok(job());
  };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));
}

function due(): boolean {
  try {
    const last = Number(window.localStorage.getItem(MARK) ?? 0);
    return !Number.isFinite(last) || Date.now() - last > EVERY;
  } catch {
    // private mode with storage denied: warm every time rather than never
    return true;
  }
}

/**
 * Ask the worker to keep these pages. It has to be the worker that fetches
 * them: a document is only cached when the request that asked for it was a
 * navigation, and a fetch() from here is not one.
 */
function keepPages(paths: string[]): void {
  if (!paths.length) return;
  navigator.serviceWorker.controller?.postMessage({
    type: "cache-pages",
    paths,
  });
}

function mark(): void {
  try {
    window.localStorage.setItem(MARK, String(Date.now()));
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
    // The lists first, because they name what else is worth having. Their own
    // answers are cached on the way past.
    const [churches, messages] = await Promise.all([
      ok(api<{ churches: Church[] }>("/api/churches")),
      ok(api<{ conversations: Conversation[] }>("/api/messages")),
    ]);

    const flat: (() => Promise<unknown>)[] = [
      () => api("/api/messages/unread"),
      () => api("/api/notifications"),
      () => api("/api/calendar"),
      () => api("/api/discover"),
      () => api("/api/profile"),
    ];

    // The pages themselves, as well as their data. A Gathering's address has
    // an id in it, so it cannot be listed among the routes the worker
    // pre-caches at install; without this the data survives the loss of signal
    // and the page to show it in does not.
    const pages: string[] = [];

    const mine = (churches as { churches?: Church[] } | null)?.churches ?? [];
    for (const c of mine.slice(0, MAX_GATHERINGS)) {
      // the Gathering, its discussions and its prayers — its screen is made of
      // these three, and its sessions arrive inside the first
      flat.push(() => api(`/api/churches/${c.id}`));
      flat.push(() => api(`/api/churches/${c.id}/threads`));
      flat.push(() => api(`/api/churches/${c.id}/prayers`));
      pages.push(`/churches/${c.id}`);
    }

    const convs =
      (messages as { conversations?: Conversation[] } | null)?.conversations ??
      [];
    for (const c of convs.slice(0, MAX_CONVERSATIONS)) {
      flat.push(() => api(`/api/messages/${c.peerId}`));
      pages.push(`/menu/messages/${c.peerId}`);
    }

    await pool(flat);
    keepPages(pages);
    mark();
  } catch {
    // offline halfway through, or signed out: what got through got through
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
