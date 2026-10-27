import { NextResponse } from "next/server";
import { getDisplayName, getUserId, nameNotAddress } from "@/lib/auth";
import { db, keys } from "@/lib/db";
import { isTrusted } from "@/lib/admin";
import { pushEnabled } from "@/lib/push";

// The reader's name, their reading-reminder hour, and what this deployment can
// do, so Settings shows accurate state.
//
// It also held a phone number for text-message reminders and a switch for
// being listed in the people directory. Both existed for the Gatherings and
// the Table — the texts announced sessions, and the directory was how you
// found somebody to message — and both went with them.

export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = (await db().hgetall(keys.user(userId))) ?? {};

  /*
   * Adopt the name the account already has, once, so a reader who has never
   * typed one into this screen is still called by their name rather than
   * "Believer" — on their own wall, among other places.
   */
  if (!profile.displayName) {
    const known = await getDisplayName(req);
    if (known && known !== "Believer") {
      profile.displayName = known;
      await db().hset(keys.user(userId), { displayName: known });
    }
  }

  return NextResponse.json({
    displayName: profile.displayName ?? "",
    planReminder: profile.planReminder === "off" ? "off" : "on",
    planReminderHour: Number(profile.planReminderHour ?? 7),
    pushAvailable: pushEnabled(),
    // what the menu uses to decide whether the admin tile exists at all
    isAdmin: await isTrusted(userId),
  });
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    displayName?: string;
    planReminderHour?: number | "off";
    planReminderTz?: string;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  if (body.displayName !== undefined) {
    // a name, never an email address typed in by mistake
    const name = nameNotAddress(body.displayName).slice(0, 60);
    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }
    updates.displayName = name;
  }
  if (body.planReminderHour !== undefined) {
    if (body.planReminderHour === "off") {
      updates.planReminder = "off";
    } else {
      const hour = Number(body.planReminderHour);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        return NextResponse.json({ error: "Invalid hour" }, { status: 400 });
      }
      updates.planReminder = "on";
      updates.planReminderHour = String(hour);
    }
  }
  if (body.planReminderTz !== undefined) {
    updates.planReminderTz = body.planReminderTz.slice(0, 64);
  }
  await db().hset(keys.user(userId), updates);
  return NextResponse.json({ ok: true });
}
