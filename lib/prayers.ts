// The prayer list inside a Gathering: what people are carrying, who is
// carrying it with them, and how it was answered.
//
// Three things a prayer list has to do that a discussion thread does not.
// It has to be countable — "nine people prayed for this" is the point, and it
// is a set of user ids, not a tally, so nobody can press twice. It has to
// close: a request that is answered stops being a request and becomes a
// record. And it has to be quiet about who asked, because some things are
// only sayable anonymously.

import { randomUUID } from "crypto";
import { db, keys } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";

export interface PrayerRequest {
  id: string;
  churchId: string;
  /** empty when the request was made anonymously */
  from: string;
  fromName: string;
  text: string;
  ts: number;
  /** how many have prayed */
  prayed: number;
  /** whether the person asking has */
  iPrayed: boolean;
  answeredAt?: number;
  answer?: string;
}

const MAX_TEXT = 1000;
const MAX_ANSWER = 1000;
/** Deep enough for a year of a busy Gathering, shallow enough to stay fast. */
const MAX_LIST = 300;

async function nameOf(userId: string): Promise<string> {
  const profile = await db().hgetall(keys.user(userId));
  return profile?.displayName || "Believer";
}

/**
 * Every request in a Gathering, newest first, with the answered ones last.
 * `iPrayed` is resolved for the asking user rather than shipping the whole
 * membership of every prayer to the client.
 */
export async function listPrayers(
  churchId: string,
  viewerId: string
): Promise<PrayerRequest[]> {
  const kv = db();
  const ids = await kv.zrangebyscore(
    keys.churchPrayers(churchId),
    0,
    Number.MAX_SAFE_INTEGER
  );
  const rows = await Promise.all(
    ids.slice(-MAX_LIST).map(async (id) => {
      const raw = await kv.hgetall(keys.prayer(id));
      if (!raw?.text) return null;
      const prayedBy = await kv.smembers(keys.prayerPrayed(id));
      const answeredAt = Number(raw.answeredAt) || 0;
      return {
        id,
        churchId: raw.churchId ?? churchId,
        from: raw.from ?? "",
        fromName: raw.fromName || "Believer",
        text: raw.text,
        ts: Number(raw.ts) || 0,
        prayed: prayedBy.length,
        iPrayed: prayedBy.includes(viewerId),
        ...(answeredAt ? { answeredAt } : {}),
        ...(raw.answer ? { answer: raw.answer } : {}),
      } satisfies PrayerRequest;
    })
  );
  return rows
    .filter((p): p is PrayerRequest => p !== null)
    .sort(
      (a, b) =>
        // still being prayed for comes first, whatever the dates say
        Number(!!a.answeredAt) - Number(!!b.answeredAt) || b.ts - a.ts
    );
}

/** Tell the rest of the Gathering, but never who asked when they asked quietly. */
async function notify(
  churchId: string,
  authorId: string,
  title: string,
  body: string
): Promise<void> {
  const members = (await db().hgetall(keys.churchMembers(churchId))) ?? {};
  for (const memberId of Object.keys(members)) {
    if (memberId === authorId) continue;
    await sendPushToUser(memberId, {
      title,
      body,
      url: `/churches/${churchId}`,
      tag: `prayers-${churchId}`,
    }).catch(() => {});
  }
}

export async function addPrayer(
  churchId: string,
  churchName: string,
  userId: string,
  text: string,
  anonymous: boolean
): Promise<PrayerRequest> {
  const kv = db();
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  const now = Date.now();
  const body = text.trim().slice(0, MAX_TEXT);
  // An anonymous request keeps no author at all — not a hidden one. There is
  // no view in this app that could reveal it, and none that could be added by
  // accident, because the id was never written down.
  const fromName = anonymous ? "" : await nameOf(userId);

  await kv.hset(keys.prayer(id), {
    churchId,
    from: anonymous ? "" : userId,
    fromName,
    text: body,
    ts: now,
  });
  await kv.zadd(keys.churchPrayers(churchId), now, id);
  await notify(
    churchId,
    anonymous ? "" : userId,
    churchName,
    anonymous ? "A new prayer request" : `${fromName} asked for prayer`
  );

  return {
    id,
    churchId,
    from: anonymous ? "" : userId,
    fromName: fromName || "Believer",
    text: body,
    ts: now,
    prayed: 0,
    iPrayed: false,
  };
}

/** Say you have prayed, or take it back. Returns where the count landed. */
export async function togglePrayed(
  prayerId: string,
  userId: string
): Promise<{ prayed: number; iPrayed: boolean } | null> {
  const kv = db();
  const raw = await kv.hgetall(keys.prayer(prayerId));
  if (!raw?.text) return null;
  const key = keys.prayerPrayed(prayerId);
  const already = (await kv.smembers(key)).includes(userId);
  if (already) await kv.srem(key, userId);
  else await kv.sadd(key, userId);
  const prayed = (await kv.smembers(key)).length;
  return { prayed, iPrayed: !already };
}

/**
 * Close a request. Only whoever asked can, which means an anonymous request
 * can only be closed by an admin — the author left no id to check against.
 */
export async function answerPrayer(
  prayerId: string,
  userId: string,
  isAdmin: boolean,
  answer: string
): Promise<boolean> {
  const kv = db();
  const raw = await kv.hgetall(keys.prayer(prayerId));
  if (!raw?.text) return false;
  if (raw.from !== userId && !isAdmin) return false;
  await kv.hset(keys.prayer(prayerId), {
    answeredAt: Date.now(),
    answer: answer.trim().slice(0, MAX_ANSWER),
  });
  return true;
}

/** Reopen one that was closed too soon. */
export async function reopenPrayer(
  prayerId: string,
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  const kv = db();
  const raw = await kv.hgetall(keys.prayer(prayerId));
  if (!raw?.text) return false;
  if (raw.from !== userId && !isAdmin) return false;
  await kv.hset(keys.prayer(prayerId), { answeredAt: "", answer: "" });
  return true;
}

/** Whoever asked may withdraw it; the Gathering's founder may moderate it. */
export async function deletePrayer(
  prayerId: string,
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  const kv = db();
  const raw = await kv.hgetall(keys.prayer(prayerId));
  if (!raw?.text) return false;
  if (raw.from !== userId && !isAdmin) return false;
  await kv.zrem(keys.churchPrayers(raw.churchId ?? ""), prayerId);
  await kv.del(keys.prayer(prayerId));
  await kv.del(keys.prayerPrayed(prayerId));
  return true;
}
