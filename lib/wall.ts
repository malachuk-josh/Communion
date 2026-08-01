// Verses hung where other people can see them.
//
// Two walls, one shape. A Gathering's wall is the verses its members have put
// up for each other — the passages the group is actually built on, which
// until now lived in the description or in somebody's memory. A reader's own
// wall is the same act with an audience of one, and it sits on their home
// screen.
//
// A wall is not a collection. A collection is filing — private, ordered,
// yours. Hanging is publishing, even when the room is small: it says "this
// one, for us". So the two are stored apart, and a verse can be in both, in
// either, or in neither.

import { db, keys } from "@/lib/db";
import { BM_KEY, parseBmKey } from "@/lib/bookmarkKey";
import { getChurch, getRole } from "@/lib/churches";

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

const wallKey = (scope: { churchId?: string; userId: string }) =>
  scope.churchId ? keys.churchWall(scope.churchId) : keys.userWall(scope.userId);

export async function listWall(scope: {
  churchId?: string;
  userId: string;
}): Promise<WallEntry[]> {
  const raw = (await db().hgetall(wallKey(scope))) ?? {};
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
  // newest first: a wall is a record of what the room is thinking about now
  return out.sort((a, b) => b.at - a.at);
}

export type HangResult =
  | { ok: true; entry: WallEntry }
  | { ok: false; reason: "bad_key" | "not_a_member" | "no_such_wall" | "full" };

export async function hangVerse(opts: {
  churchId?: string;
  userId: string;
  displayName: string;
  key: string;
  note?: string;
}): Promise<HangResult> {
  const ref = parseBmKey(opts.key);
  if (!ref || !BM_KEY.test(opts.key)) return { ok: false, reason: "bad_key" };

  if (opts.churchId) {
    const church = await getChurch(opts.churchId);
    if (!church) return { ok: false, reason: "no_such_wall" };
    // Members only. A wall is the room speaking to itself, and somebody who
    // has not joined the room is not part of that conversation.
    if (!(await getRole(opts.churchId, opts.userId))) {
      return { ok: false, reason: "not_a_member" };
    }
  }

  const kv = db();
  const key = wallKey(opts);
  const existing = (await kv.hgetall(key)) ?? {};
  // Already up. Left as whoever hung it first hung it: a wall records who
  // brought a verse to the room, and the second person to reach for it did
  // not bring it.
  if (existing[opts.key]) {
    const held = await listWall(opts);
    const entry = held.find((e) => e.key === opts.key);
    if (entry) return { ok: true, entry };
  }
  /*
   * Counted, then written, with no transaction between — so two people
   * hanging a verse at the same instant on a wall with one space left can
   * both find it. Deliberately left that way: each write is a single field
   * that clobbers nothing, so the failure is a wall of sixty-one, and it
   * corrects itself the moment anybody takes one down. Every mechanism that
   * would close the gap on this store — reserve-then-verify, or a rollback —
   * risks deleting a verse somebody legitimately hung, which is a worse thing
   * to be wrong about than a number.
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
  const { key: _key, b: _b, c: _c, v: _v, end: _end, ...stored } = entry;
  await kv.hset(key, { [opts.key]: JSON.stringify(stored) });
  return { ok: true, entry };
}

/**
 * Take a verse down.
 *
 * Whoever hung it, and the Gathering's founder. Not every member: a wall the
 * room built should not be editable by whoever happens to disagree with one
 * verse on it, and the founder is who answers for the room.
 */
export async function unhangVerse(opts: {
  churchId?: string;
  userId: string;
  key: string;
}): Promise<boolean> {
  const kv = db();
  const key = wallKey(opts);
  const raw = (await kv.hgetall(key))?.[opts.key];
  if (!raw) return false;

  if (opts.churchId) {
    let mine = false;
    try {
      mine = (JSON.parse(raw) as { by?: string }).by === opts.userId;
    } catch {
      mine = false;
    }
    if (!mine) {
      const church = await getChurch(opts.churchId);
      if (church?.founderId !== opts.userId) return false;
    }
  }
  await kv.hdel(key, opts.key);
  return true;
}

/** Every wall goes when its Gathering does. */
export async function deleteChurchWall(churchId: string): Promise<void> {
  await db().del(keys.churchWall(churchId));
}
