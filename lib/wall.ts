// The reader's wall: the verses they have put up on their home screen.
//
// A wall is not a collection. A collection is filing — ordered, kept for
// later. Hanging a verse says "this one, in front of me, now", which is a
// different act, so the two are stored apart and a verse can be in both, in
// either, or in neither.
//
// There used to be a second kind, a Gathering's wall, with members and a
// founder who could take things down. The Gatherings are gone, and what is
// left is the wall with an audience of one.

import { db, keys } from "@/lib/db";
import { BM_KEY, parseBmKey } from "@/lib/bookmarkKey";

export interface WallEntry {
  /** the bookmark key, which is also its place on the wall */
  key: string;
  b: number;
  c: number;
  v: number;
  end: number;
  /** who hung it, so a wall reads as people rather than as a list */
  by: string;
  byName: string;
  at: number;
  /** a line about why, if they left one */
  note?: string;
}

/** How many one wall will hold. Past this it stops being a wall. */
export const WALL_MAX = 60;

export async function listWall(scope: { userId: string }): Promise<WallEntry[]> {
  const raw = (await db().hgetall(keys.userWall(scope.userId))) ?? {};
  const out: WallEntry[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const ref = parseBmKey(key);
    if (!ref) continue;
    try {
      const stored = JSON.parse(value) as Omit<WallEntry, "key" | keyof typeof ref>;
      out.push({ key, ...ref, ...stored } as WallEntry);
    } catch {
      // a row we cannot read is a row we do not hang
    }
  }
  // newest first: a wall is a record of what is on the reader's mind now
  return out.sort((a, b) => b.at - a.at);
}

export type HangResult =
  | { ok: true; entry: WallEntry }
  | { ok: false; reason: "bad_key" | "full" };

export async function hangVerse(opts: {
  userId: string;
  displayName: string;
  key: string;
  note?: string;
}): Promise<HangResult> {
  const ref = parseBmKey(opts.key);
  if (!ref || !BM_KEY.test(opts.key)) return { ok: false, reason: "bad_key" };

  const kv = db();
  const key = keys.userWall(opts.userId);

  // already up: left as it was first hung, with its note and its date
  const alreadyUp = async (): Promise<WallEntry | null> => {
    const held = await listWall(opts);
    return held.find((e) => e.key === opts.key) ?? null;
  };

  const existing = (await kv.hgetall(key)) ?? {};
  if (existing[opts.key]) {
    const entry = await alreadyUp();
    if (entry) return { ok: true, entry };
  }
  /*
   * Counted, then written, with no transaction between — so two devices
   * hanging a verse at the same instant on a wall with one space left can
   * both find it. Deliberately left that way: each write is a single field
   * that clobbers nothing, so the failure is a wall of sixty-one, and it
   * corrects itself the moment one comes down.
   */
  if (Object.keys(existing).length >= WALL_MAX) {
    return { ok: false, reason: "full" };
  }

  const entry: WallEntry = {
    key: opts.key,
    ...ref,
    by: opts.userId,
    byName: opts.displayName,
    at: Date.now(),
    ...(opts.note?.trim() ? { note: opts.note.trim().slice(0, 200) } : {}),
  };
  // asked once more immediately before writing, so a second device hanging
  // the same verse in the same second keeps the first one's note and date
  if (((await kv.hgetall(key)) ?? {})[opts.key]) {
    const winner = await alreadyUp();
    if (winner) return { ok: true, entry: winner };
  }

  const { key: _key, b: _b, c: _c, v: _v, end: _end, ...stored } = entry;
  await kv.hset(key, { [opts.key]: JSON.stringify(stored) });
  return { ok: true, entry };
}

/** Take a verse down. */
export async function unhangVerse(opts: {
  userId: string;
  key: string;
}): Promise<boolean> {
  const kv = db();
  const key = keys.userWall(opts.userId);
  if (!(await kv.hgetall(key))?.[opts.key]) return false;
  await kv.hdel(key, opts.key);
  return true;
}
