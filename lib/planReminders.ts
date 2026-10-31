// What time of day each reading plan asks for you.
//
// This used to be one hour for everybody's plans at once, set in Settings. One
// hour is wrong the moment somebody walks two plans, which is the ordinary
// case: a chapter of Proverbs belongs to the morning and the Psalms belong to
// the end of the day, and a single setting makes you choose which of the two
// gets reminded properly. So the hour moved onto the plan itself, in the
// Journal, where the plan already lives.
//
// Which days of the week it asks on is the plan's too, under "<planId>:days":
// the plans themselves are the recommendation, a reading every day, but a
// reader who reads on weekdays, or on Sundays and Wednesdays, should hear
// from the plan on those days and be left alone on the others. The plan does
// not change — its days are counted, not dated — it only comes round slower.
//
// Stored beside the plan's progress in the same hash, under "<planId>:at" —
// the hash already keeps "<planId>:on" for the date it was last read, and a
// plan's reminder is a fact about that plan in the same way. Plan ids carry
// no colon, so a suffixed field can never be mistaken for one.

import { db, keys } from "@/lib/db";
import { DEFAULT_PLAN_HOUR, EVERY_DAY, type PlanDays, type PlanHour } from "@/lib/planSchedule";

export { DEFAULT_PLAN_HOUR, EVERY_DAY, type PlanDays, type PlanHour };

/** Field names inside user:<id>:plans. */
const at = (planId: string) => `${planId}:at`;
const nudged = (planId: string) => `${planId}:nudged`;
const onDays = (planId: string) => `${planId}:days`;

/** Every field a plan keeps besides its progress, for clearing when it is left. */
export const planFields = (planId: string) => [
  `${planId}:on`,
  at(planId),
  nudged(planId),
  onDays(planId),
];

/** "135" back into [1, 3, 5]; nothing stored is every day. */
function parseDays(raw: string | undefined): PlanDays {
  const days = [...new Set((raw ?? "").replace(/[^0-6]/g, "").split("").map(Number))].sort();
  return days.length ? days : EVERY_DAY;
}

/** Days a reader chose, if they are days: 0–6, each once, at least one. */
export function cleanDays(value: unknown): PlanDays | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const days = [...new Set(value)];
  if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return null;
  return (days as number[]).sort();
}

/** A stored field name that is a plan id rather than one of its attributes. */
export function isPlanId(field: string): boolean {
  return !field.includes(":");
}

function parseHour(raw: string | undefined): PlanHour | null {
  if (raw === undefined) return null;
  if (raw === "off") return "off";
  const hour = Number(raw);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

/**
 * What the reader had before any of this existed.
 *
 * Their old single setting becomes the answer for every plan that has not
 * been given one of its own, so nobody's reminders move because the control
 * moved. Only a plan they actually set overrides it.
 */
export function fallbackHour(profile: Record<string, string>): PlanHour {
  if (profile.planReminder === "off") return "off";
  return parseHour(profile.planReminderHour) ?? DEFAULT_PLAN_HOUR;
}

/** Every plan's hour and days for one reader, plans they are not walking included. */
export async function readPlanHours(
  userId: string
): Promise<{ hours: Record<string, PlanHour>; days: Record<string, PlanDays>; tz: string }> {
  const kv = db();
  const [raw, profile] = await Promise.all([
    kv.hgetall(keys.userPlans(userId)),
    kv.hgetall(keys.user(userId)),
  ]);
  const fields = raw ?? {};
  const fallback = fallbackHour(profile ?? {});
  const hours: Record<string, PlanHour> = {};
  const days: Record<string, PlanDays> = {};
  for (const field of Object.keys(fields)) {
    if (!isPlanId(field)) continue;
    hours[field] = parseHour(fields[at(field)]) ?? fallback;
    days[field] = parseDays(fields[onDays(field)]);
  }
  return { hours, days, tz: profile?.planReminderTz ?? "" };
}

/**
 * Set one plan's hour.
 *
 * The timezone is written alongside because the sweep runs hourly and matches
 * a local hour against the reader's clock — an hour with no zone to read it
 * in is a number that means nothing. It is one value per reader rather than
 * one per plan: a person is in one place.
 */
export async function writePlanHour(
  userId: string,
  planId: string,
  hour: PlanHour,
  tz?: string,
  /** the days it asks on, where they are being changed too */
  days?: PlanDays
): Promise<void> {
  const kv = db();
  const updates: Record<string, string> = {
    [at(planId)]: hour === "off" ? "off" : String(hour),
  };
  // every day is kept as nothing at all: it is the default, and a plan that
  // has never been told otherwise reads the same
  if (days) updates[onDays(planId)] = days.length === 7 ? "" : days.join("");
  // Moving the hour clears today's mark. Somebody who sets a plan to 8pm at
  // noon should hear from it this evening, not tomorrow — and the mark is
  // only there to stop the same plan asking twice in one day.
  updates[nudged(planId)] = "";
  await kv.hset(keys.userPlans(userId), updates);
  if (tz) await kv.hset(keys.user(userId), { planReminderTz: tz.slice(0, 64) });
}

/** The hour one plan asks at, read from fields already in hand. */
export function hourOf(
  fields: Record<string, string>,
  profile: Record<string, string>,
  planId: string
): PlanHour {
  return parseHour(fields[at(planId)]) ?? fallbackHour(profile);
}

/** The days one plan asks on, read from fields already in hand. */
export function daysOf(fields: Record<string, string>, planId: string): PlanDays {
  return parseDays(fields[onDays(planId)]);
}

/** Whether this plan has already spoken up today. */
export function nudgedOn(
  fields: Record<string, string>,
  planId: string
): string {
  return fields[nudged(planId)] ?? "";
}

/** Mark a plan as having asked today. */
export async function markNudged(
  userId: string,
  planId: string,
  day: string
): Promise<void> {
  await db().hset(keys.userPlans(userId), { [nudged(planId)]: day });
}
