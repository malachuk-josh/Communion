import { NextResponse } from "next/server";
import { buildIcs } from "@/lib/calendar";
import { db, keys } from "@/lib/db";
import { emailEnabled, reminderEmail, sendEmail } from "@/lib/email";

// Daily reminder sweep (Vercel Cron, see vercel.json): emails every member
// of a Church about sessions starting within the next 24 hours. Each event
// is reminded once (remindedAt flag). Requires Brevo email config; guests
// without Clerk accounts have no email and are skipped.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!emailEnabled()) {
    return NextResponse.json({ skipped: "email not configured" });
  }

  const kv = db();
  const now = Date.now();
  const ids = await kv.zrangebyscore(
    keys.allEvents,
    now,
    now + 24 * 60 * 60 * 1000
  );

  let sent = 0;
  let reminded = 0;
  for (const eventId of ids) {
    const event = await kv.hgetall(keys.event(eventId));
    if (!event?.churchId || event.remindedAt) continue;

    const church = await kv.hgetall(keys.church(event.churchId));
    const members = (await kv.hgetall(keys.churchMembers(event.churchId))) ?? {};

    const emails: string[] = [];
    if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      for (const userId of Object.keys(members)) {
        if (!userId.startsWith("user_")) continue; // guests have no email
        try {
          const user = await client.users.getUser(userId);
          const email = user.primaryEmailAddress?.emailAddress;
          if (email) emails.push(email);
        } catch {
          // deleted user — skip
        }
      }
    }

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
      church?.name ?? "your Church",
      event.title ?? "Worship session",
      when,
      event.meetingUrl || undefined
    );
    // attach an .ics so calendar apps recognize the session natively
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const ics = buildIcs(
      {
        id: eventId,
        churchId: event.churchId,
        title: event.title ?? "Worship session",
        startsAt: Number(event.startsAt),
        durationMin: Number(event.durationMin) || 60,
        passageRef: event.passageRef || undefined,
        meetingUrl: event.meetingUrl || undefined,
        details: event.details || undefined,
      },
      church?.name ?? "your Church",
      origin
    );
    const attachment = {
      name: "session.ics",
      contentBase64: Buffer.from(ics, "utf-8").toString("base64"),
    };
    for (const to of emails) {
      if (await sendEmail(to, message.subject, message.html, attachment)) sent++;
    }
    await kv.hset(keys.event(eventId), { remindedAt: now });
    reminded++;
  }

  return NextResponse.json({ upcoming: ids.length, reminded, sent });
}
