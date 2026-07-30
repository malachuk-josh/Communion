import { NextResponse } from "next/server";
import { getBook } from "@/lib/bible";
import { buildIcs } from "@/lib/calendar";
import { db, keys } from "@/lib/db";
import { resolvePlan } from "@/lib/customPlans";
import {
  hourOf,
  isPlanId,
  markNudged,
  nudgedOn,
} from "@/lib/planReminders";
import { emailEnabled, reminderEmail, sendEmail } from "@/lib/email";
import { pushEnabled, sendPushToUser } from "@/lib/push";
import { sendSms, smsEnabled } from "@/lib/sms";

// Daily reminder sweep (Vercel Cron, see vercel.json): notifies every member
// of a Church about sessions starting within the next 24 hours, over every
// configured channel — email (Brevo), web push (VAPID), and SMS (Brevo,
// opt-in per user in Settings). Each event is reminded once (remindedAt).

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!emailEnabled() && !pushEnabled() && !smsEnabled()) {
    return NextResponse.json({ skipped: "no reminder channels configured" });
  }

  const kv = db();
  const now = Date.now();
  const ids = await kv.zrangebyscore(
    keys.allEvents,
    now,
    now + 24 * 60 * 60 * 1000
  );

  let emails = 0;
  let pushes = 0;
  let sms = 0;
  let reminded = 0;
  for (const eventId of ids) {
    const event = await kv.hgetall(keys.event(eventId));
    if (!event?.churchId || event.remindedAt) continue;

    const church = await kv.hgetall(keys.church(event.churchId));
    const members = (await kv.hgetall(keys.churchMembers(event.churchId))) ?? {};
    const churchName = church?.name ?? "your Gathering";
    const title = event.title ?? "Worship session";

    const when = new Date(Number(event.startsAt)).toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
    const message = reminderEmail(
      churchName,
      title,
      when,
      event.meetingUrl || undefined
    );
    // attach an .ics so calendar apps recognize the session natively
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const ics = buildIcs(
      {
        id: eventId,
        churchId: event.churchId,
        title,
        startsAt: Number(event.startsAt),
        durationMin: Number(event.durationMin) || 60,
        passageRef: event.passageRef || undefined,
        meetingUrl: event.meetingUrl || undefined,
        details: event.details || undefined,
      },
      churchName,
      origin
    );
    const attachment = {
      name: "session.ics",
      contentBase64: Buffer.from(ics, "utf-8").toString("base64"),
    };

    const clerkOn = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const client =
      clerkOn && emailEnabled()
        ? await (await import("@clerk/nextjs/server")).clerkClient()
        : null;

    const smsText =
      `Communion: ${title} with ${churchName} — ${when}. ` +
      (event.meetingUrl || `${origin}/churches/${event.churchId}`);

    for (const userId of Object.keys(members)) {
      if (client && userId.startsWith("user_")) {
        try {
          const user = await client.users.getUser(userId);
          const email = user.primaryEmailAddress?.emailAddress;
          if (
            email &&
            (await sendEmail(email, message.subject, message.html, attachment))
          ) {
            emails++;
          }
        } catch {
          // deleted user — skip
        }
      }
      // Not gated on push being configured. sendPushToUser writes the
      // notification to the reader's history before it looks at a VAPID key
      // at all, and the history is the record of what happened — whether or
      // not this deployment can also make a phone buzz about it.
      pushes += await sendPushToUser(userId, {
        title: `⛪ ${title}`,
        body: `${churchName} · ${when}`,
        url: `/churches/${event.churchId}`,
        tag: `reminder-${eventId}`,
      });
      if (smsEnabled()) {
        const profile = await kv.hgetall(keys.user(userId));
        if (profile?.phone && profile.smsReminders === "1") {
          if (await sendSms(profile.phone, smsText)) sms++;
        }
      }
    }

    await kv.hset(keys.event(eventId), { remindedAt: now });
    reminded++;
  }

  const plans = await sweepPlanReminders();

  return NextResponse.json({
    upcoming: ids.length,
    reminded,
    emails,
    pushes,
    sms,
    plans,
  });
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
  // no push gate: see the note above the session reminder
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

      const hour = hourOf(fields, profile, field);
      if (hour === "off" || hour !== nowHour) continue;
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
