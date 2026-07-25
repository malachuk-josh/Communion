"use client";

// Local-first writes. Every change lands in IndexedDB and the outbox first,
// so the UI never waits on a network it may not have; the outbox drains to
// /api/sync whenever there is a connection. Operations state intent rather
// than a delta, so replaying a batch that half-landed is safe.

import { api } from "@/lib/client";
import {
  clearLocalData,
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
  /** which account this copy belongs to */
  who?: string;
}

const STATE_KEY = "bookmarks";

type Listener = (pending: number) => void;
const listeners = new Set<Listener>();
let pending = 0;
let flushing: Promise<BookmarkState | null> | null = null;
let lastFlushFailed = false;

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

/**
 * Reconcile who this device's data belongs to. Signing in as someone else —
 * or out of a guest session into an account — must not push one person's
 * bookmarks into another's. Returns true if local data was discarded.
 */
export async function adoptIdentity(who: string | undefined): Promise<boolean> {
  if (!who) return false;
  const local = await readLocalState();
  if (!local || !local.who || local.who === who) return false;
  await clearLocalData();
  return true;
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

/** The server rejects a batch larger than this, so send it in slices. */
const BATCH = 200;

/**
 * Drain the outbox. Ops are sent in batches and each batch's rows are dropped
 * only once the server has taken them, so nothing is lost if the connection
 * dies partway. Returns the reconciled state if anything was sent.
 */
export function flush(): Promise<BookmarkState | null> {
  // the guard and the assignment must not be separated by an await, or two
  // callers both pass it and send the same ops twice
  if (flushing) return flushing.then(() => null);
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return Promise.resolve(null);
  }
  flushing = (async (): Promise<BookmarkState | null> => {
    let result: BookmarkState | null = null;
    try {
      for (;;) {
        const queued = (await readOutbox()).slice(0, BATCH);
        if (queued.length === 0) break;
        const ops = queued.map(({ seq: _seq, ...op }) => op);
        const res = await api<{
          who?: string;
          applied: number;
          rejected: number;
          bookmarks: Record<string, BmEntry>;
          collections: Record<string, BmCollection>;
        }>("/api/sync", { method: "POST", body: { ops } });
        // only drop this batch — anything queued meanwhile keeps its place
        await dropOutbox(queued.map((o) => o.seq));
        result = {
          bookmarks: res.bookmarks,
          collections: res.collections,
          who: res.who,
        };
      }
      if (result) {
        // A change made while the request was in flight is still queued, so
        // the server's answer does not know about it. Writing it as-is would
        // erase it from this device until the next flush; leave the snapshot
        // alone and let that flush reconcile.
        if ((await readOutbox()).length === 0) await writeLocalState(result);
        else result = null;
      }
    } catch {
      // still offline, or the server said no: the queue keeps its place
      lastFlushFailed = true;
    } finally {
      flushing = null;
      await refreshPending();
    }
    if (result) lastFlushFailed = false;
    return result;
  })();
  return flushing;
}

/** True when the last attempt to reach the server failed outright. */
export function flushFailed(): boolean {
  return lastFlushFailed;
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
