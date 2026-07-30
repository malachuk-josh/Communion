import { bmKeyOf } from "@/lib/bookmarkKey";
import { db, keys } from "@/lib/db";
import { WALL_MAX, type WallEntry } from "@/lib/wall";

/**
 * The four verses every wall starts with.
 *
 * An empty wall does not teach anybody what a wall is for. A reader who opens
 * their home screen and finds four verses already hanging understands the
 * feature in the time it takes to read them — and understands it as something
 * to add to rather than something to set up.
 *
 * These four, and not four at random. Matthew 18:20 is the verse this app is
 * named for and built on. Galatians 6:10 is what a Gathering is supposed to do
 * once it has gathered. John 3:16 is the one verse anybody arriving already
 * knows, which makes it the one that says "yes, this is that book". And
 * Philippians 3:13-14 is kept as the run it is, because the forgetting in
 * verse 13 is only worth anything with the pressing on in verse 14 — and
 * because a wall of promises with nothing asked of the reader is a poster.
 */
interface SeedVerse {
  b: number;
  c: number;
  v: number;
  end?: number;
}

export const WALL_VERSES: SeedVerse[] = [
  { b: 40, c: 18, v: 20 }, // Matthew — where two or three are gathered
  { b: 48, c: 6, v: 10 }, // Galatians — as we have therefore opportunity
  { b: 43, c: 3, v: 16 }, // John — for God so loved the world
  { b: 50, c: 3, v: 13, end: 14 }, // Philippians — I press toward the mark
];

/** Kept beside the collection and plan seeds, in the same hash. */
const SEED_MARK = "wall:default";

/**
 * Hang them, once.
 *
 * Once per account, and never again: the marker goes down before anything is
 * written, so a verse the reader takes down stays down and two parallel first
 * loads cannot both hang the same four. Which also means an account that
 * predates this gets them the next time it opens a wall, and only then.
 *
 * Hung under the reader's own name, because that is whose wall it is. The
 * timestamps are counted down through the list rather than all set to now, so
 * the wall's newest-first order shows them in the order written above instead
 * of in whatever order the writes happened to land.
 */
export async function seedDefaultWall(
  userId: string,
  displayName: string
): Promise<boolean> {
  const kv = db();
  const seeds = await kv.hgetall(keys.userSeeds(userId));
  if (seeds?.[SEED_MARK]) return false;
  const now = Date.now();
  await kv.hset(keys.userSeeds(userId), { [SEED_MARK]: String(now) });

  // Added to a wall somebody has already begun rather than instead of it: a
  // verse they hung themselves keeps its place and its date, and the four go
  // up alongside. Nothing already there is written over.
  const existing = (await kv.hgetall(keys.userWall(userId))) ?? {};
  let room = WALL_MAX - Object.keys(existing).length;

  const writes: Record<string, string> = {};
  WALL_VERSES.forEach((verse, i) => {
    const key = bmKeyOf(verse.b, verse.c, verse.v, verse.end ?? verse.v);
    if (existing[key] !== undefined || room <= 0) return;
    room--;
    const stored: Omit<WallEntry, "key" | "b" | "c" | "v" | "end"> = {
      by: userId,
      byName: displayName,
      at: now - i * 1000,
    };
    writes[key] = JSON.stringify(stored);
  });
  if (Object.keys(writes).length === 0) return false;
  await kv.hset(keys.userWall(userId), writes);
  return true;
}
