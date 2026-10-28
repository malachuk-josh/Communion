// Illumination: questions answered by Claude — about a verse, to the
// scholars, and in the described search — for every signed-in reader.
//
// Every answer is paid for out of the owner's own API credit, so the server
// checks three things on every question:
//
//   an account    signed in. A guest is a browser, and an allowance handed
//                 to a browser goes to whoever holds it next.
//   their tier    a daily allowance: TIERS.standard for every account, and
//                 the owner may set anyone to TIERS.plus or to unlimited from
//                 the dashboard. The owner is always unlimited. It is not the
//                 same as trusted: a tier does not hand anyone the dashboard.
//   the app's day PER_APP questions a day across the limited tiers — the
//                 ceiling on what a bad day can cost. Unlimited readers are
//                 neither stopped by it nor counted toward it: being stopped
//                 by a shared ceiling is not unlimited.
//
// Hiding the buttons from guests is a courtesy, not the lock.
//
// Nothing anybody asks is kept here. The conversation lives on the reader's
// device and comes up whole with each question; what the server writes down is
// how many questions, and how many tokens, so the owner can see what it costs.

import { db, keys } from "@/lib/db";
import { isOwner } from "@/lib/admin";

/** The cheapest current model. See the cost note on PRICE. */
export const ASK_MODEL = "claude-haiku-5-5";

/**
 * The tiers, and what each may ask in a UTC day. "standard" is every
 * account's unless the owner says otherwise, and is not stored.
 */
export type AskTier = "standard" | "plus" | "unlimited";
export const TIERS = { standard: 10, plus: 25 } as const;
export const PER_APP = 1000;

/** A day's allowance, or null for no limit. */
export function tierLimit(tier: AskTier): number | null {
  return tier === "unlimited" ? null : TIERS[tier];
}

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

/**
 * A signed-in account: Clerk's ids start "user_". Where Clerk is not set up
 * at all — a checkout running on its own — nobody can sign in and the app
 * asks nobody to, so every reader counts, as everywhere else in that mode.
 */
function signedIn(userId: string): boolean {
  return userId.startsWith("user_") || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

/**
 * Everyone the owner has given more than the standard day, by tier.
 *
 * The tiers came after a single switch, kept as a set of the people it was
 * on for at 25 a day. That set is still read, as the 25 tier, so nobody who
 * had it loses it; setting anyone's tier takes them out of it.
 */
export async function askTiers(): Promise<Record<string, AskTier>> {
  const kv = db();
  const [set, legacy] = await Promise.all([
    kv.hgetall(keys.askTiers),
    kv.smembers(keys.askUsers),
  ]);
  const out: Record<string, AskTier> = {};
  for (const id of legacy) out[id] = "plus";
  for (const [id, tier] of Object.entries(set ?? {})) {
    if (tier === "plus" || tier === "unlimited") out[id] = tier;
  }
  return out;
}

/** Someone's tier, or null for nobody who may ask at all. */
export async function tierOf(userId: string | null): Promise<AskTier | null> {
  if (!userId) return null;
  if (isOwner(userId)) return "unlimited";
  if (!signedIn(userId)) return null;
  return (await askTiers())[userId] ?? "standard";
}

export async function canAsk(userId: string | null): Promise<boolean> {
  return (await tierOf(userId)) !== null;
}

/** Set someone's tier. The owner's own is not ours to edit. */
export async function setTier(userId: string, tier: AskTier): Promise<void> {
  if (isOwner(userId)) return;
  const kv = db();
  await kv.srem(keys.askUsers, userId);
  if (tier === "standard") await kv.hdel(keys.askTiers, userId);
  else await kv.hset(keys.askTiers, { [userId]: tier });
}

/**
 * Questions left today for this person — theirs or the app's, whichever is
 * fewer — and, when none are, whose ran out. `left` is null for a reader
 * with no limit.
 */
export async function questionsLeft(
  userId: string,
  tier: AskTier
): Promise<{ left: number | null; limit: "person" | "app" | null }> {
  const allowance = tierLimit(tier);
  if (allowance === null) return { left: null, limit: null };
  const day = (await db().hgetall(keys.askDay(utcDay()))) ?? {};
  const mine = allowance - (Number(day[`q:${userId}`]) || 0);
  const all = PER_APP - (Number(day.capped) || 0);
  const left = Math.max(0, Math.min(mine, all));
  return { left, limit: left > 0 ? null : mine <= 0 ? "person" : "app" };
}

export type Taken =
  | { ok: true; day: string; left: number | null; capped: boolean }
  | { ok: false; why: "person" | "app" };

/**
 * Take one question out of today's allowances, or say which has run out.
 *
 * Counted before the question is sent rather than after it is answered, and
 * by an increment rather than a read: two questions in flight at once must not
 * both see the last one left. One that turns out to be over is put straight
 * back.
 */
export async function takeQuestion(userId: string, tier: AskTier): Promise<Taken> {
  const kv = db();
  const day = utcDay();
  const key = keys.askDay(day);
  const allowance = tierLimit(tier);
  const mine = await kv.hincrby(key, `q:${userId}`, 1);
  if (allowance !== null && mine > allowance) {
    await kv.hincrby(key, `q:${userId}`, -1);
    return { ok: false, why: "person" };
  }
  // the ceiling counts only the limited tiers, so an unlimited reader's
  // questions never use up anybody else's day
  let capped = 0;
  if (allowance !== null) {
    capped = await kv.hincrby(key, "capped", 1);
    if (capped > PER_APP) {
      await kv.hincrby(key, "capped", -1);
      await kv.hincrby(key, `q:${userId}`, -1);
      return { ok: false, why: "app" };
    }
  }
  // every question, for the dashboard's count
  await kv.hincrby(key, "q", 1);
  await kv.expire(key, DAY_TTL_SECONDS);
  return {
    ok: true,
    day,
    left: allowance === null ? null : Math.min(allowance - mine, PER_APP - capped),
    capped: allowance !== null,
  };
}

/** A question that never reached the model costs nothing, so it is not counted. */
export async function giveBack(userId: string, taken: { day: string; capped: boolean }): Promise<void> {
  const kv = db();
  const key = keys.askDay(taken.day);
  await kv.hincrby(key, "q", -1);
  await kv.hincrby(key, `q:${userId}`, -1);
  if (taken.capped) await kv.hincrby(key, "capped", -1);
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
  tiers: { standard: number; plus: number };
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
    tiers: { ...TIERS },
    perApp: PER_APP,
    today: { questions: Number(today.q) || 0, spend: spendOf(today) },
    month: { questions, spend },
    people,
  };
}
