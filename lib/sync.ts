"use client";

// Local-first writes. Every change lands in IndexedDB and the outbox first,
// so the UI never waits on a network it may not have; the outbox drains to
// /api/sync whenever there is a connection. Operations state intent rather
// than a delta, so replaying a batch that half-landed is safe.

import { api } from "@/lib/client";
import {
  dropOutbox,
  getLocal,
  putLocal,
  pushOutbox,
  readOutbox,
  STATE_STORE,
  NOTES_STORE,
  type SyncOp,
} from "@/lib/localStore";

export interface BmEntry {
  t: number;
  l?: string;
  c?: string;
}
export interface BmCollection {
  name: string;
  share?: string;
}
export interface BookmarkState {
  bookmarks: Record<string, BmEntry>;
  collections: Record<string, BmCollection>;
}

const STATE_KEY = "bookmarks";

type Listener = (pending: number) => void;
const listeners = new Set<Listener>();
let pending = 0;
let flushing: Promise<void> | null = null;

function announce() {
  for (const fn of listeners) fn(pending);
}

/** Watch how many changes are still waiting to reach the server. */
export function onPendingChange(fn: Listener): () => void {
  listeners.add(fn);
  fn(pending);
  return () => listeners.delete(fn);
}

export function pendingCount(): number {
  return pending;
}

async function refreshPending() {
  pending = (await readOutbox()).length;
  announce();
}

/** The device's own copy — instant, and all there is when offline. */
export function readLocalState(): Promise<BookmarkState | null> {
  return getLocal<BookmarkState>(STATE_STORE, STATE_KEY);
}

export function writeLocalState(state: BookmarkState): Promise<void> {
  return putLocal(STATE_STORE, STATE_KEY, state);
}

export function readLocalNotes(book: number): Promise<Record<string, string> | null> {
  return getLocal<Record<string, string>>(NOTES_STORE, book);
}

export function writeLocalNotes(
  book: number,
  notes: Record<string, string>
): Promise<void> {
  return putLocal(NOTES_STORE, book, notes);
}

/** Record a change locally and try to send it. Never throws, never blocks. */
export async function enqueue(op: SyncOp): Promise<void> {
  await pushOutbox(op);
  await refreshPending();
  void flush();
}

/**
 * Drain the outbox. One request carries the whole queue and comes back with
 * the server's state, so a device that has been away catches up in one trip.
 * Returns the reconciled state when anything was sent.
 */
export async function flush(): Promise<BookmarkState | null> {
  if (flushing) {
    await flushing;
    return null;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return null;
  }
  const queued = await readOutbox();
  if (queued.length === 0) return null;

  let result: BookmarkState | null = null;
  flushing = (async () => {
    try {
      const ops = queued.map(({ seq: _seq, ...op }) => op);
      const res = await api<{
        applied: number;
        rejected: number;
        bookmarks: Record<string, BmEntry>;
        collections: Record<string, BmCollection>;
      }>("/api/sync", { method: "POST", body: { ops } });
      // only drop what we actually sent — anything queued meanwhile stays
      await dropOutbox(queued.map((o) => o.seq));
      result = { bookmarks: res.bookmarks, collections: res.collections };
      await writeLocalState(result);
    } catch {
      // still offline, or the server said no: the queue keeps its place
    } finally {
      flushing = null;
      await refreshPending();
    }
  })();
  await flushing;
  return result;
}

let wired = false;

/** Flush on reconnect, on returning to the app, and once at startup. */
export function startSync(): () => void {
  void refreshPending();
  if (wired) return () => {};
  wired = true;
  const onOnline = () => void flush();
  const onVisible = () => {
    if (document.visibilityState === "visible") void flush();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  void flush();
  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    wired = false;
  };
}
