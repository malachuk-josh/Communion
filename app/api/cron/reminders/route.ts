import { NextResponse } from "next/server";
import { getBook } from "@/lib/bible";
import { db, keys } from "@/lib/db";
import { resolvePlan } from "@/lib/customPlans";
import {
  hourOf,
  isPlanId,
  markNudged,
  nudgedOn,
} from "@/lib/planReminders";
import { pushEnabled, sendPushToUser } from "@/lib/push";

// Hourly reminder sweep (Vercel Cron, see vercel.json): nudges each reader by
// web push at the hour each of their reading plans asks for.
//
// It used to remind every member of a Gathering about sessions starting within
// the day as well, by email, push and text message. The Gatherings are gone,
// and the sessions with them, so a reading plan is the only thing left in the
// app with an hour of its own — and push the only channel it was ever sent on.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!pushEnabled()) {
    return NextResponse.json({ skipped: "push is not configured" });
  }
  const plans = await sweepPlanReminders();
  return NextResponse.json({ plans });
}

/** The hour it is right now in a given IANA timezone (falls back to UTC). */
function hourIn(timeZone: string | undefined): number {
  try {
    return Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timeZone || "UTC",
        hour: "numeric",
        hour12: false,
      }).format(new Date())
    );
  } catch {
    return new Date().getUTCHours();
  }
}

/** Today's date in a timezone, as YYYY-MM-DD. */
function dayIn(timeZone: string | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Nudge readers at the hour each plan asks for.
 *
 * One push per plan, not one per person. That is the whole point of the hour
 * living on the plan: somebody who reads Proverbs at six and the Psalms at
 * ten wants two nudges at two times, and rolling them into one would mean
 * choosing whose hour to honour.
 *
 * Finished plans and plans already read today are skipped, and each plan
 * carries its own mark for the day, so one asking at seven does not stop
 * another asking at nine.
 */
async function sweepPlanReminders(): Promise<{ notified: number }> {
  const kv = db();
  const userIds = await kv.smembers(keys.planUsers);
  let notified = 0;

  for (const userId of userIds) {
    const profile = (await kv.hgetall(keys.user(userId))) ?? {};
    const fields = (await kv.hgetall(keys.userPlans(userId))) ?? {};
    const tz = profile.planReminderTz;
    const nowHour = hourIn(tz);
    const today = dayIn(tz);

    for (const field of Object.keys(fields)) {
      // ":on", ":at" and ":nudged" are facts about a plan, not plans
      if (!isPlanId(field)) continue;
      // a plan this reader wrote for themselves resolves here too, or it
      // would be the one plan that never says anything
      const plan = await resolvePlan(userId, field);
      if (!plan) continue;

      /*
       * At the hour asked for, or as soon after as we are running.
       *
       * This used to demand the hour match exactly, which quietly meant a
       * reminder set for 2am was never sent on the Sunday the clocks go
       * forward: 2am does not happen that day, so the sweep never saw it, and
       * a daily habit lost a day twice a year. The same held for any hour the
       * cron missed — a single late run and that reminder was simply gone.
       *
       * A two-hour grace covers both without turning into "some time today":
       * the mark below still allows only one nudge a day, and somebody whose
       * hour passed this morning is not pestered about it at ten at night.
       */
      const hour = hourOf(fields, profile, field);
      if (hour === "off") continue;
      if (nowHour < hour || nowHour - hour > 2) continue;
      if (nudgedOn(fields, field) === today) continue; // asked already today

      const done = Number(fields[field]) || 0;
      // Finished plans only. Day 0 used to be skipped as "not started", which
      // was right when the only way to have a plan was to begin one — and is
      // wrong now that every account is enrolled in one on the day it is
      // made. Day 1 is the whole point of the first morning's reminder.
      if (done >= plan.days.length) continue;
      if (fields[`${field}:on`] === today) continue; // read today already

      const readings = plan.days[done].readings;
      const first = getBook(readings[0].b);
      const last = getBook(readings[readings.length - 1].b);
      const label =
        readings.length === 1
          ? `${first?.en} ${readings[0].c}`
          : `${first?.en} ${readings[0].c} – ${last?.en} ${
              readings[readings.length - 1].c
            }`;

      await sendPushToUser(userId, {
        title: plan.name,
        body: `Day ${done + 1} — ${label}`,
        // straight to the plan itself, not to the top of the page it lives on
        url: `/discover?plan=${plan.id}`,
        // per plan and per day: two plans due at the same hour are two
        // notifications, and neither should replace the other
        tag: `plan-${plan.id}-${today}`,
      }).catch(() => {});
      await markNudged(userId, field, today);
      notified++;
    }
  }
  return { notified };
}
