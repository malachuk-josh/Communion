import { db, keys } from "@/lib/db";

/**
 * Every account starts enrolled in one reading plan, and expecting to be
 * reminded of it.
 *
 * The whole Bible in a year, because the thing this app is for is reading
 * Scripture, and the single largest reason people do not is that nothing ever
 * asks them to. An account that arrives already walking a plan has a Day 1
 * waiting the first morning rather than a directory of plans to choose from —
 * and choosing is exactly the step at which somebody puts it off.
 *
 * Nothing here is a trap. The plan can be reset or ignored, the reminder can
 * be switched off in settings, and the marker below means that once either is
 * done it stays done: this seeds once per account and never returns to
 * re-enrol anybody who walked away.
 */
export const DEFAULT_PLAN_ID = "bible365";

/** The hour it asks, in the reader's own timezone, until they say otherwise. */
export const DEFAULT_REMINDER_HOUR = 7;

/** Kept beside the collection seeds, in the same hash, under its own name. */
const SEED_MARK = "plan:default";

/**
 * Enrol this account, once.
 *
 * The reminder settings are written rather than left to default. They already
 * read as on-at-seven when absent, so this changes nothing about what happens
 * — but a value that only exists as a fallback is one nobody can see they
 * have, and a reader opening settings should find the switch that is acting
 * on them actually set.
 */
export async function seedDefaultPlan(userId: string): Promise<boolean> {
  const kv = db();
  const seeds = await kv.hgetall(keys.userSeeds(userId));
  if (seeds?.[SEED_MARK]) return false;
  // claimed before anything is written, so two parallel first loads cannot
  // both enrol the same person
  await kv.hset(keys.userSeeds(userId), { [SEED_MARK]: String(Date.now()) });

  // Never over a plan they are already walking. Somebody who found this plan
  // on their own before we got here keeps the days they have read.
  const plans = await kv.hgetall(keys.userPlans(userId));
  if (plans?.[DEFAULT_PLAN_ID] === undefined) {
    await kv.hset(keys.userPlans(userId), { [DEFAULT_PLAN_ID]: 0 });
  }
  // the sweep reads this set to know whom to ask
  await kv.sadd(keys.planUsers, userId);

  const profile = await kv.hgetall(keys.user(userId));
  const settings: Record<string, string> = {};
  if (profile?.planReminder === undefined) settings.planReminder = "on";
  if (profile?.planReminderHour === undefined) {
    settings.planReminderHour = String(DEFAULT_REMINDER_HOUR);
  }
  if (Object.keys(settings).length > 0) {
    await kv.hset(keys.user(userId), settings);
  }
  return true;
}
