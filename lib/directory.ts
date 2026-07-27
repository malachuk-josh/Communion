// Who can be found, and by whom.
//
// The Table used to reach only as far as your Gatherings: the contacts it
// offered were the members of churches you had joined, and the send refused
// anyone else. That is the right default for a room and the wrong one for a
// congregation — believers meet outside the groups they have joined, and a
// person you met once should be reachable without first being enrolled
// somewhere.
//
// So there is a directory, and it holds everyone who has given a name and not
// asked to be left out of it. Asking to be left out is a deletion from this
// hash rather than a flag stored beside the name, which means privacy cannot
// be lost to a forgotten check somewhere downstream: a private person is not
// in the list that search reads, so no search can return them.
//
// Being unlisted is not the same as being unreachable. A conversation already
// open stays open, and someone who knows the person — from a Gathering, from a
// message already sent — can still write to them. What the setting governs is
// discovery by strangers, which is what "private" means to the person choosing
// it.

import { db, keys } from "@/lib/db";

export interface DirectoryEntry {
  userId: string;
  displayName: string;
}

/** How many names one search may return. */
const LIMIT = 30;

/**
 * Put someone in the directory, or keep them out of it.
 *
 * Called wherever a profile is read or written, so that the directory fills
 * itself from ordinary use rather than needing a migration: everybody who
 * opens their settings or their messages is listed by doing so.
 */
export async function syncListing(
  userId: string,
  profile: Record<string, string> | null
): Promise<void> {
  const name = profile?.displayName?.trim();
  const hidden = profile?.private === "1";
  if (!name || hidden) {
    await db().hdel(keys.directory, userId);
    return;
  }
  await db().hset(keys.directory, { [userId]: name });
}

/** Whether this person has asked to be left out of it. */
export async function isPrivate(userId: string): Promise<boolean> {
  const profile = await db().hgetall(keys.user(userId));
  return profile?.private === "1";
}

/**
 * Names matching a query, never including the searcher's own.
 *
 * A blank query lists the directory rather than nothing: on a small
 * deployment that is the whole point — you open the picker and see who is
 * there. It is capped either way.
 */
export async function searchDirectory(
  userId: string,
  query: string
): Promise<DirectoryEntry[]> {
  const all = (await db().hgetall(keys.directory)) ?? {};
  const needle = query.trim().toLowerCase();
  const out: DirectoryEntry[] = [];
  for (const [id, displayName] of Object.entries(all)) {
    if (id === userId || !displayName) continue;
    if (needle && !displayName.toLowerCase().includes(needle)) continue;
    out.push({ userId: id, displayName });
  }
  out.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return out.slice(0, LIMIT);
}
