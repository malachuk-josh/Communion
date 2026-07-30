// Reading plans people write for themselves.
//
// The catalogue in lib/plans.ts is fixed, named in both dictionaries, and the
// same for everybody. These are not: a reader builds one out of whatever they
// mean to read, gives it a name in their own words, and it belongs to their
// account. Everything downstream — progress, the reminder hour, marking a day
// done, leaving it — already works by plan id, so a custom plan is a plan
// everywhere once the id resolves.
//
// Which is the whole difficulty. getPlan() is synchronous and static because
// the catalogue is; a custom plan lives in Redis under one account. So the
// server resolves through resolvePlan(), which tries the catalogue first and
// then that reader's own. Anything server-side that used getPlan() on a plan
// id a reader could have chosen has to go through it, or a custom plan looks
// to the server like a plan that does not exist.

import { randomUUID } from "crypto";
import { getBook } from "@/lib/bible";
import { db, keys } from "@/lib/db";
import type { CustomPlanRow, Ref } from "@/lib/customPlanTypes";
import { getPlan, type Plan, type PlanDay } from "@/lib/plans";

// The shapes themselves live in lib/customPlanTypes.ts, which the browser can
// import — this module cannot be, since it holds the Redis client.
export type { Ref } from "@/lib/customPlanTypes";
export type CustomPlan = CustomPlanRow;

/**
 * Limits, and the reason for each.
 *
 * A plan is a hash field holding one JSON string, so the real ceiling is how
 * much of one it is reasonable to write and read at once. A year of readings
 * is about six kilobytes; these bounds sit above what anybody would build by
 * hand and well below anything that would make the account slow to load.
 */
export const MAX_DAYS = 400;
export const MAX_PER_DAY = 12;
export const MAX_NAME = 60;
export const MAX_PLANS = 20;

/** No colon: a plan id has to survive being a field name in the plans hash. */
const ID_RE = /^custom-[a-f0-9]{12}$/;

export function isCustomId(id: string): boolean {
  return ID_RE.test(id);
}

export function newCustomId(): string {
  return `custom-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/**
 * Take what a client sent and keep only what is actually a reading.
 *
 * Chapters are checked against the book they claim to be in, so a plan cannot
 * be built pointing at Genesis 73 — the reader would meet an empty page on
 * the day it came round, days or months after building it, with nothing to
 * say what went wrong.
 */
export function cleanDays(input: unknown): Ref[][] {
  if (!Array.isArray(input)) return [];
  const out: Ref[][] = [];
  for (const day of input.slice(0, MAX_DAYS)) {
    if (!Array.isArray(day)) continue;
    const refs: Ref[] = [];
    for (const ref of day.slice(0, MAX_PER_DAY)) {
      if (!Array.isArray(ref) || ref.length < 2) continue;
      const b = Number(ref[0]);
      const c = Number(ref[1]);
      const book = getBook(b);
      if (!book || !Number.isInteger(c) || c < 1 || c > book.chapters) continue;
      refs.push([b, c]);
    }
    if (refs.length > 0) out.push(refs);
  }
  return out;
}

export function cleanName(input: unknown): string {
  return String(input ?? "").trim().slice(0, MAX_NAME);
}

/** The stored shape, in the shape the rest of the app understands. */
export function toPlan(custom: CustomPlan): Plan {
  const days: PlanDay[] = custom.days.map((day) => ({
    readings: day.map(([b, c]) => ({ b, c })),
  }));
  return {
    id: custom.id,
    // The builder does not ask for one. A plan somebody wrote is theirs
    // whatever it is about, and picking an emblem for it is a decision to
    // make somebody take before they can save.
    icon: "plan",
    category: "foundations",
    // What the server calls it — this is the title a push notification
    // carries, and the one place a custom plan's name has to exist outside
    // the reader's own browser.
    name: custom.name,
    days,
  };
}

export async function readCustomPlans(
  userId: string
): Promise<Record<string, CustomPlan>> {
  const raw = (await db().hgetall(keys.userCustomPlans(userId))) ?? {};
  const out: Record<string, CustomPlan> = {};
  for (const [id, value] of Object.entries(raw)) {
    try {
      const plan = JSON.parse(value) as CustomPlan;
      if (plan && Array.isArray(plan.days) && plan.days.length > 0) {
        out[id] = { ...plan, id };
      }
    } catch {
      // a row we cannot read is a plan we cannot offer
    }
  }
  return out;
}

export async function readCustomPlan(
  userId: string,
  planId: string
): Promise<CustomPlan | null> {
  if (!isCustomId(planId)) return null;
  const raw = (await db().hgetall(keys.userCustomPlans(userId)))?.[planId];
  if (!raw) return null;
  try {
    const plan = JSON.parse(raw) as CustomPlan;
    return plan && Array.isArray(plan.days) ? { ...plan, id: planId } : null;
  } catch {
    return null;
  }
}

export async function writeCustomPlan(
  userId: string,
  plan: CustomPlan
): Promise<void> {
  const { id, ...rest } = plan;
  await db().hset(keys.userCustomPlans(userId), {
    [id]: JSON.stringify(rest),
  });
}

/**
 * The plan behind an id, whoever wrote it.
 *
 * The catalogue first, because it is free and is what almost every id is.
 * Only an id shaped like a custom one costs a read, so a reader walking
 * nothing but the built-in plans never pays for this.
 */
export async function resolvePlan(
  userId: string,
  planId: string
): Promise<Plan | undefined> {
  const known = getPlan(planId);
  if (known) return known;
  if (!isCustomId(planId)) return undefined;
  const custom = await readCustomPlan(userId, planId);
  return custom ? toPlan(custom) : undefined;
}

// ---- sharing -------------------------------------------------------------

/** The same sixteen hex characters a shared collection uses. */
export const SHARE_RE = /^[a-f0-9]{16}$/;

export function newShareToken(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

export interface SharedPlanSnapshot {
  name: string;
  sharedBy: string;
  days: Ref[][];
  updatedAt: number;
}

/**
 * Publish a copy of the plan under a token.
 *
 * A snapshot rather than a pointer, the way a shared collection is: the link
 * has to keep working when the person who sent it edits their copy, and it
 * must not become a window into an account. Re-sharing rewrites the snapshot
 * under the same token, so one link stays current.
 */
export async function publishPlan(
  plan: CustomPlan,
  sharedBy: string
): Promise<string> {
  const token = plan.share ?? newShareToken();
  const snapshot: SharedPlanSnapshot = {
    name: plan.name,
    sharedBy: publicName(sharedBy),
    days: plan.days,
    updatedAt: Date.now(),
  };
  await db().hset(keys.sharedPlan(token), { data: JSON.stringify(snapshot) });
  return token;
}

/** Take a published plan down. The link stops resolving from here on. */
export async function unpublishPlan(token: string): Promise<void> {
  if (!SHARE_RE.test(token)) return;
  await db().del(keys.sharedPlan(token));
}

/**
 * A name safe to publish at an address anyone can read.
 *
 * getDisplayName falls back to the account's email when Clerk holds no name,
 * which is the right answer inside the app and the wrong one here: the
 * snapshot is served unauthenticated, so whatever goes in it is public to
 * anyone the link reaches and anyone they forward it to. Somebody sharing a
 * reading plan is not offering their email address.
 */
export function publicName(name: string): string {
  const at = name.indexOf("@");
  if (at <= 0 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(name)) return name;
  return name.slice(0, at);
}

export async function readSharedPlan(
  token: string
): Promise<SharedPlanSnapshot | null> {
  if (!SHARE_RE.test(token)) return null;
  const raw = (await db().hgetall(keys.sharedPlan(token)))?.data;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SharedPlanSnapshot;
  } catch {
    return null;
  }
}
