import { NextResponse } from "next/server";
import { buildIcs } from "@/lib/calendar";
import { db, keys } from "@/lib/db";
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
    const churchName = church?.name ?? "your Church";
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
      if (pushEnabled()) {
        pushes += await sendPushToUser(userId, {
          title: `⛪ ${title}`,
          body: `${churchName} · ${when}`,
          url: `/churches/${event.churchId}`,
          tag: `reminder-${eventId}`,
        });
      }
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

  return NextResponse.json({ upcoming: ids.length, reminded, emails, pushes, sms });
}
