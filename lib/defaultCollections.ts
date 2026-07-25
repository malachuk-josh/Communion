import { db, keys } from "@/lib/db";

// Every account starts with one study collection already built: "The Gospel",
// following the four-step track from Mount Greylock Baptist Church
// (mountgreylockbaptist.com/finding-life). Seeding happens once per user —
// the marker in `user:<id>:seeds` means a deleted collection stays deleted.

export const GOSPEL_COLLECTION_ID = "gospel";

interface SeedVerse {
  b: number;
  c: number;
  v: number;
  /** section heading from the track, stored as the bookmark label */
  label: string;
  labelEs: string;
}

export const GOSPEL_TRACK: SeedVerse[] = [
  {
    b: 1,
    c: 1,
    v: 27,
    label: "You Were Made for More",
    labelEs: "Fuiste hecho para algo más",
  },
  {
    b: 45,
    c: 6,
    v: 23,
    label: "Something Went Wrong",
    labelEs: "Algo salió mal",
  },
  { b: 43, c: 3, v: 16, label: "The Good News", labelEs: "Las buenas nuevas" },
  { b: 43, c: 14, v: 6, label: "Your Response", labelEs: "Tu respuesta" },
];

export function gospelName(es: boolean): string {
  return es ? "El Evangelio" : "The Gospel";
}

interface StoredEntry {
  t: number;
  l?: string;
  c?: string;
}

/**
 * Give a user the default collection the first time we see them. Existing
 * bookmarks on the same verses are adopted rather than overwritten, so nobody
 * loses a label they wrote themselves.
 */
export async function seedDefaultCollections(
  userId: string,
  es = false
): Promise<boolean> {
  const kv = db();
  const seeds = await kv.hgetall(keys.userSeeds(userId));
  if (seeds?.[GOSPEL_COLLECTION_ID]) return false;
  // claim the seed before writing so two parallel loads don't both plant it
  await kv.hset(keys.userSeeds(userId), {
    [GOSPEL_COLLECTION_ID]: String(Date.now()),
  });

  const [collections, bookmarks] = await Promise.all([
    kv.hgetall(keys.userCollections(userId)),
    kv.hgetall(keys.userBookmarks(userId)),
  ]);
  if (!collections?.[GOSPEL_COLLECTION_ID]) {
    await kv.hset(keys.userCollections(userId), {
      [GOSPEL_COLLECTION_ID]: JSON.stringify({ name: gospelName(es) }),
    });
  }

  // newest-first is how the bookmark list sorts, so count the timestamps
  // down through the track to keep Ethan's order intact
  const base = Date.now();
  const writes: Record<string, string> = {};
  GOSPEL_TRACK.forEach((verse, i) => {
    const key = `${verse.b}:${verse.c}:${verse.v}`;
    const label = es ? verse.labelEs : verse.label;
    const raw = bookmarks?.[key];
    if (raw === undefined) {
      writes[key] = JSON.stringify({
        t: base - i * 1000,
        l: label,
        c: GOSPEL_COLLECTION_ID,
      });
      return;
    }
    let entry: StoredEntry;
    try {
      entry = JSON.parse(raw) as StoredEntry;
    } catch {
      entry = { t: Number(raw) || base - i * 1000 };
    }
    if (entry.c) return; // already filed somewhere the user chose
    writes[key] = JSON.stringify({
      ...entry,
      l: entry.l || label,
      c: GOSPEL_COLLECTION_ID,
    });
  });
  if (Object.keys(writes).length > 0) {
    await kv.hset(keys.userBookmarks(userId), writes);
  }
  return true;
}
