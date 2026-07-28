import { NextResponse } from "next/server";
import { getDisplayName, getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";
import { isTrusted } from "@/lib/admin";
import { pushEnabled } from "@/lib/push";
import { isValidPhone, smsEnabled } from "@/lib/sms";
import { syncListing } from "@/lib/directory";

// Reminder preferences: phone number + SMS opt-in, and feature availability
// flags so Settings can show accurate state per deployment.

export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = (await db().hgetall(keys.user(userId))) ?? {};

  /*
   * Adopt the name the account already has.
   *
   * displayName was only ever written by starting a Gathering, accepting an
   * invite, or typing it into this screen — so somebody who signed in and read
   * their Bible had none at all. That was invisible while the only use of a
   * name was labelling a member list, and became a real fault the moment the
   * directory existed: with nothing stored they were unlisted, and unlisted
   * looked exactly like having asked for privacy, which they had not.
   *
   * Clerk knows who they are. Take that, once, and keep it — so the directory
   * can find them, and so conversations stop calling them "Believer".
   */
  if (!profile.displayName) {
    const known = await getDisplayName(req);
    if (known && known !== "Believer") {
      profile.displayName = known;
      await db().hset(keys.user(userId), { displayName: known });
    }
  }

  // Listing is kept in step here as well as on write, so the directory fills
  // itself from ordinary use — everyone who opens their settings is listed by
  // doing so, and nobody needs a migration to become findable.
  await syncListing(userId, profile).catch(() => {});
  return NextResponse.json({
    displayName: profile.displayName ?? "",
    private: profile.private === "1",
    phone: profile.phone ?? "",
    smsReminders: profile.smsReminders === "1",
    planReminder: profile.planReminder === "off" ? "off" : "on",
    planReminderHour: Number(profile.planReminderHour ?? 7),
    pushAvailable: pushEnabled(),
    smsAvailable: smsEnabled(),
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
    private?: boolean;
    phone?: string;
    smsReminders?: boolean;
    planReminderHour?: number | "off";
    planReminderTz?: string;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  if (body.displayName !== undefined) {
    const name = body.displayName.trim().slice(0, 60);
    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }
    updates.displayName = name;
  }
  if (body.private !== undefined) {
    updates.private = body.private ? "1" : "";
  }
  if (body.phone !== undefined) {
    let phone = body.phone.replace(/[\s().-]/g, "");
    // Domestic convenience: a bare 10-digit number is a US/Canada number
    if (/^\d{10}$/.test(phone)) phone = `+1${phone}`;
    else if (/^1\d{10}$/.test(phone)) phone = `+${phone}`;
    if (phone && !isValidPhone(phone)) {
      return NextResponse.json(
        { error: "Invalid phone — use international format, e.g. +15551234567" },
        { status: 400 }
      );
    }
    updates.phone = phone;
    if (!phone) updates.smsReminders = ""; // no number → no SMS opt-in
  }
  if (body.smsReminders !== undefined) {
    updates.smsReminders = body.smsReminders ? "1" : "";
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
  // The name or the setting may just have changed; the directory is derived
  // from both, so it is rebuilt from what the profile now says rather than
  // patched from what this request happened to carry.
  await syncListing(userId, await db().hgetall(keys.user(userId)));
  return NextResponse.json({ ok: true });
}
