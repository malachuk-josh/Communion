/**
 * How often one person may do a thing.
 *
 * The pattern was already here, written out by hand where Gatherings are
 * created: a sorted set of timestamps per user, counted over a window. It is
 * written once here because two of the loudest actions in the app — sending
 * a message, asking for prayer — had no limit at all, and because a limiter
 * copied by hand into five routes is five chances to forget the sweep.
 *
 * A member is "<ts>.<nonce>" rather than a bare timestamp: two actions in the
 * same millisecond must be two members, or a set would silently count them
 * once. The timestamp is carried in the member as well as the score because
 * reading a score back is not part of this KV's contract, and the answer
 * "try again in about two hours" needs a real number.
 *
 * Honest about what this is: the store has no MULTI, so count-then-add is not
 * atomic and a burst fired in parallel can slip a few past the line. That
 * raises the cost of abuse from unbounded to bounded, which is the point —
 * it is a flood gate, not a ledger. Anything needing exactness needs a
 * different store.
 */

import { db } from "@/lib/db";

export interface RateVerdict {
  ok: boolean;
  /** ms until the oldest action in the window ages out (0 when ok) */
  retryInMs: number;
}

/**
 * Count what this user has done in the window, and record this one if there
 * is room. Sweeps anything older than the window so the key cannot grow for
 * the life of the account.
 */
export async function takeRateSlot(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateVerdict> {
  const kv = db();
  const now = Date.now();
  const since = now - windowMs;

  const recent = await kv.zrangebyscore(key, since, now);
  if (recent.length >= limit) {
    const oldest = Number(recent[0]?.split(".")[0]) || since;
    return { ok: false, retryInMs: Math.max(0, oldest + windowMs - now) };
  }

  for (const stale of await kv.zrangebyscore(key, 0, since - 1)) {
    await kv.zrem(key, stale);
  }

  const nonce = Math.random().toString(36).slice(2, 8);
  await kv.zadd(key, now, `${now}.${nonce}`);
  await kv.expire(key, Math.ceil(windowMs / 1000));
  return { ok: true, retryInMs: 0 };
}

/*
 * Ceilings that more than one route has to agree on.
 *
 * A prayer request can be made from inside a Gathering or from the wall, and
 * the wall can fan one request out to several Gatherings at once. Those are
 * two routes spending from one allowance, so the allowance is written here:
 * if the two files each kept their own number, the larger window would sweep
 * away members the smaller one was still counting, and the limit would quietly
 * become whichever route the asker happened to use.
 */
export const PRAYER_LIMIT = 10;
export const PRAYER_WINDOW_MS = 60 * 60_000;

/** "in about 3 minutes" / "in about 2 hours" — for a message a person reads. */
export function untilNext(ms: number): string {
  const mins = Math.ceil(ms / 60000);
  if (mins <= 1) return "a moment";
  if (mins < 60) return `${mins} minutes`;
  const hours = Math.ceil(mins / 60);
  return hours === 1 ? "an hour" : `${hours} hours`;
}
