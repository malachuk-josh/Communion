// Questions about a verse, answered by Claude, for the people the owner lets
// ask them.
//
// Every answer is paid for out of the owner's own API credit, so three things
// stand between a reader and a request, and the server checks all three on
// every question:
//
//   the switch     the owner turns it on per person, from the dashboard. The
//                  owner always has it. It is not the same as trusted: being
//                  given the chat does not hand anyone the dashboard.
//   their day      PER_PERSON questions each, per UTC day
//   the app's day  PER_APP questions across everyone, per UTC day — the
//                  ceiling on what a bad day can cost, whoever has the switch
//
// Hiding the button from everyone else is a courtesy, not the lock.
//
// Nothing anybody asks is kept here. The conversation lives on the reader's
// device and comes up whole with each question; what the server writes down is
// how many questions, and how many tokens, so the owner can see what it costs.

import { db, keys } from "@/lib/db";
import { isOwner } from "@/lib/admin";

/** The cheapest current model. See the cost note on PRICE. */
export const ASK_MODEL = "claude-haiku-5-5";

export const PER_PERSON = 25;
export const PER_APP = 300;

/** Questions in one conversation, after which it starts over. */
export const MAX_TURNS = 10;
export const MAX_QUESTION = 1000;
/** What an answer coming back up from the device may be, at most. */
export const MAX_ANSWER = 6000;

/*
 * Dollars per million tokens, at the rate for prompts under 100K tokens —
 * which these always are, by a long way. Only ever used to estimate spend for
 * the dashboard; Anthropic's console is the bill.
 */
const PRICE = { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 };

/** A day's tally is kept long enough to add up a month, then lets go. */
const DAY_TTL_SECONDS = 40 * 24 * 60 * 60;

export function utcDay(at = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** When today's allowance comes back: the next midnight, UTC. */
export function nextReset(at = Date.now()): number {
  const d = new Date(at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** Whether the deployment has an API key at all. */
export function askConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

/** The people switched on — the owner is not in here, and needs no switch. */
export async function askIds(): Promise<string[]> {
  return db().smembers(keys.askUsers);
}

export async function canAsk(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  if (isOwner(userId)) return true;
  return (await askIds()).includes(userId);
}

/** Switch it on or off for someone. The owner's own is not ours to edit. */
export async function setAsk(userId: string, on: boolean): Promise<void> {
  if (isOwner(userId)) return;
  const kv = db();
  if (on) await kv.sadd(keys.askUsers, userId);
  else await kv.srem(keys.askUsers, userId);
}

/**
 * Questions left today for this person — theirs or the app's, whichever is
 * fewer — and, when none are, whose ran out.
 */
export async function questionsLeft(
  userId: string
): Promise<{ left: number; limit: "person" | "app" | null }> {
  const day = (await db().hgetall(keys.askDay(utcDay()))) ?? {};
  const mine = PER_PERSON - (Number(day[`q:${userId}`]) || 0);
  const all = PER_APP - (Number(day.q) || 0);
  const left = Math.max(0, Math.min(mine, all));
  return { left, limit: left > 0 ? null : mine <= 0 ? "person" : "app" };
}

export type Taken =
  | { ok: true; day: string; left: number }
  | { ok: false; why: "person" | "app" };

/**
 * Take one question out of today's allowances, or say which has run out.
 *
 * Counted before the question is sent rather than after it is answered, and
 * by an increment rather than a read: two questions in flight at once must not
 * both see the last one left. One that turns out to be over is put straight
 * back.
 */
export async function takeQuestion(userId: string): Promise<Taken> {
  const kv = db();
  const day = utcDay();
  const key = keys.askDay(day);
  const mine = await kv.hincrby(key, `q:${userId}`, 1);
  if (mine > PER_PERSON) {
    await kv.hincrby(key, `q:${userId}`, -1);
    return { ok: false, why: "person" };
  }
  const all = await kv.hincrby(key, "q", 1);
  if (all > PER_APP) {
    await kv.hincrby(key, "q", -1);
    await kv.hincrby(key, `q:${userId}`, -1);
    return { ok: false, why: "app" };
  }
  await kv.expire(key, DAY_TTL_SECONDS);
  return { ok: true, day, left: Math.min(PER_PERSON - mine, PER_APP - all) };
}

/** A question that never reached the model costs nothing, so it is not counted. */
export async function giveBack(userId: string, day: string): Promise<void> {
  const kv = db();
  const key = keys.askDay(day);
  await kv.hincrby(key, "q", -1);
  await kv.hincrby(key, `q:${userId}`, -1);
}

export interface AskUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** What one answer used, for the dashboard's estimate. */
export async function recordUsage(
  userId: string,
  day: string,
  used: AskUsage
): Promise<void> {
  const kv = db();
  const key = keys.askDay(day);
  const fields: [string, number][] = [
    ["in", used.input],
    ["out", used.output],
    ["cr", used.cacheRead],
    ["cw", used.cacheWrite],
  ];
  for (const [field, n] of fields) {
    if (!n) continue;
    await kv.hincrby(key, field, n);
    await kv.hincrby(key, `${field}:${userId}`, n);
  }
}

function spendOf(day: Record<string, string>, who?: string): number {
  const n = (field: string) =>
    Number(day[who ? `${field}:${who}` : field]) || 0;
  return (
    (n("in") * PRICE.in +
      n("out") * PRICE.out +
      n("cr") * PRICE.cacheRead +
      n("cw") * PRICE.cacheWrite) /
    1_000_000
  );
}

export interface AskSummary {
  configured: boolean;
  model: string;
  perPerson: number;
  perApp: number;
  today: { questions: number; spend: number };
  /** the last thirty UTC days, today included */
  month: { questions: number; spend: number };
  /** today, per person who asked anything */
  people: Record<string, { questions: number; spend: number }>;
}

export async function askSummary(): Promise<AskSummary> {
  const kv = db();
  const now = Date.now();
  const days = await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      kv.hgetall(keys.askDay(utcDay(now - i * 86_400_000)))
    )
  );
  const today = days[0] ?? {};
  const people: AskSummary["people"] = {};
  for (const field of Object.keys(today)) {
    if (!field.startsWith("q:")) continue;
    const who = field.slice(2);
    people[who] = {
      questions: Number(today[field]) || 0,
      spend: spendOf(today, who),
    };
  }
  let questions = 0;
  let spend = 0;
  for (const day of days) {
    if (!day) continue;
    questions += Number(day.q) || 0;
    spend += spendOf(day);
  }
  return {
    configured: askConfigured(),
    model: ASK_MODEL,
    perPerson: PER_PERSON,
    perApp: PER_APP,
    today: { questions: Number(today.q) || 0, spend: spendOf(today) },
    month: { questions, spend },
    people,
  };
}
