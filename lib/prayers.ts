// The reader's prayer list, on their wall.
//
// It was the prayer list inside a Gathering, carried by the room, and it went
// with the Gatherings. What comes back is the part that was always the
// reader's own: what they are praying about, the days they prayed for it, and
// how it was answered. Nobody else sees it — so there is nobody's count to
// show but their own, and nothing to ask anonymously.
//
// One hash per reader and a field per prayer, like the wall beside it.

import { nanoid } from "nanoid";
import { db, keys } from "@/lib/db";

export interface Prayer {
  id: string;
  text: string;
  /** when it was written down */
  at: number;
  /** the days they prayed for it, as dates on their own calendar (YYYY-MM-DD) */
  days: string[];
  answeredAt?: number;
  answer?: string;
}

type Stored = Omit<Prayer, "id">;

const MAX_TEXT = 1000;
const MAX_ANSWER = 1000;
/** Deep enough for years of one person's list, shallow enough to read whole. */
export const PRAYERS_MAX = 300;
/** A year and a little more is enough to say "you have kept at this". */
const MAX_DAYS = 400;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function read(id: string, value: string): Prayer | null {
  try {
    const s = JSON.parse(value) as Partial<Stored>;
    if (typeof s.text !== "string" || !s.text) return null;
    const answeredAt = Number(s.answeredAt) || 0;
    return {
      id,
      text: s.text,
      at: Number(s.at) || 0,
      days: Array.isArray(s.days)
        ? s.days.filter((d): d is string => typeof d === "string" && DAY.test(d))
        : [],
      ...(answeredAt ? { answeredAt } : {}),
      ...(s.answer ? { answer: String(s.answer) } : {}),
    };
  } catch {
    // a row we cannot read is a row we do not show
    return null;
  }
}

/**
 * Still being prayed for first, newest first; then the answered ones, the
 * latest answer first. The list a reader comes back to should open on what
 * they are carrying now.
 */
export function inOrder(list: Prayer[]): Prayer[] {
  return list.sort(
    (a, b) =>
      Number(!!a.answeredAt) - Number(!!b.answeredAt) ||
      (b.answeredAt ?? 0) - (a.answeredAt ?? 0) ||
      b.at - a.at
  );
}

export async function listPrayers(userId: string): Promise<Prayer[]> {
  const raw = (await db().hgetall(keys.userPrayers(userId))) ?? {};
  return inOrder(
    Object.entries(raw)
      .map(([id, value]) => read(id, value))
      .filter((p): p is Prayer => p !== null)
  );
}

async function write(userId: string, prayer: Prayer): Promise<void> {
  const { id, ...stored } = prayer;
  await db().hset(keys.userPrayers(userId), { [id]: JSON.stringify(stored) });
}

export type AddResult =
  | { ok: true; prayer: Prayer }
  | { ok: false; reason: "empty" | "full" };

export async function addPrayer(userId: string, text: string): Promise<AddResult> {
  const body = text.trim().slice(0, MAX_TEXT);
  if (!body) return { ok: false, reason: "empty" };
  const held = (await db().hgetall(keys.userPrayers(userId))) ?? {};
  if (Object.keys(held).length >= PRAYERS_MAX) return { ok: false, reason: "full" };
  const prayer: Prayer = { id: nanoid(12), text: body, at: Date.now(), days: [] };
  await write(userId, prayer);
  return { ok: true, prayer };
}

export type Change =
  | { action: "edit"; text: string }
  | { action: "answer"; answer?: string }
  | { action: "reopen" }
  /** `day` is the reader's own date: their today, not the server's */
  | { action: "prayed"; day: string; prayed: boolean };

export type ChangeResult =
  | { ok: true; prayer: Prayer }
  | { ok: false; reason: "missing" | "invalid" };

export async function changePrayer(
  userId: string,
  id: string,
  change: Change
): Promise<ChangeResult> {
  const value = ((await db().hgetall(keys.userPrayers(userId))) ?? {})[id];
  const prayer = value ? read(id, value) : null;
  if (!prayer) return { ok: false, reason: "missing" };

  if (change.action === "edit") {
    const body = change.text.trim().slice(0, MAX_TEXT);
    if (!body) return { ok: false, reason: "invalid" };
    prayer.text = body;
  } else if (change.action === "answer") {
    prayer.answeredAt = Date.now();
    const said = change.answer?.trim().slice(0, MAX_ANSWER);
    if (said) prayer.answer = said;
    else delete prayer.answer;
  } else if (change.action === "reopen") {
    delete prayer.answeredAt;
    delete prayer.answer;
  } else {
    if (!DAY.test(change.day)) return { ok: false, reason: "invalid" };
    const days = new Set(prayer.days);
    if (change.prayed) days.add(change.day);
    else days.delete(change.day);
    prayer.days = [...days].sort().slice(-MAX_DAYS);
  }

  await write(userId, prayer);
  return { ok: true, prayer };
}

export async function removePrayer(userId: string, id: string): Promise<boolean> {
  const kv = db();
  if (!((await kv.hgetall(keys.userPrayers(userId))) ?? {})[id]) return false;
  await kv.hdel(keys.userPrayers(userId), id);
  return true;
}

/** Kept beside the wall's and the plans' seeds, in the same hash. */
const MOVED_MARK = "prayers:moved";

/**
 * Bring the reader's own requests over from the Gatherings, once.
 *
 * Those lists are gone from the app but not from the store, and a request
 * somebody asked there is still theirs. So the first time their own list is
 * opened, every request they asked under their name comes across — the words,
 * the day it was asked, and how it was answered, if it was. Other people's
 * requests stay where they were, and so do requests asked anonymously: those
 * were written down with no name to find them by, on purpose.
 *
 * Every Gathering is walked, not only the ones they still belonged to, for
 * the reason account deletion walks them all: a request outlives a
 * membership. It happens once per reader. The marker goes down first, and a
 * moved request keeps a name made from its old id, so two first loads at the
 * same moment write the same fields rather than two copies.
 */
export async function moveOldPrayers(userId: string): Promise<number> {
  const kv = db();
  const seeds = await kv.hgetall(keys.userSeeds(userId));
  if (seeds?.[MOVED_MARK]) return 0;
  await kv.hset(keys.userSeeds(userId), { [MOVED_MARK]: String(Date.now()) });

  const sources = [
    keys.publicPrayers,
    ...(await kv.smembers(keys.allChurches)).map((id) => keys.churchPrayers(id)),
  ];
  const held = (await kv.hgetall(keys.userPrayers(userId))) ?? {};
  let room = PRAYERS_MAX - Object.keys(held).length;
  const writes: Record<string, string> = {};

  for (const source of sources) {
    for (const oldId of await kv.zrangebyscore(source, 0, Number.MAX_SAFE_INTEGER)) {
      if (room <= 0) break;
      const raw = await kv.hgetall(keys.prayer(oldId));
      if (!raw?.text || raw.from !== userId) continue;
      const id = `was-${oldId}`;
      if (held[id] !== undefined || writes[id] !== undefined) continue;
      const answeredAt = Number(raw.answeredAt) || 0;
      const stored: Stored = {
        text: raw.text.slice(0, MAX_TEXT),
        at: Number(raw.ts) || Date.now(),
        days: [],
        ...(answeredAt ? { answeredAt } : {}),
        ...(raw.answer ? { answer: raw.answer.slice(0, MAX_ANSWER) } : {}),
      };
      writes[id] = JSON.stringify(stored);
      room--;
    }
  }

  if (Object.keys(writes).length > 0) {
    await kv.hset(keys.userPrayers(userId), writes);
  }
  return Object.keys(writes).length;
}
