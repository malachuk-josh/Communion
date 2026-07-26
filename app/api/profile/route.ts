import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";
import { isOwner } from "@/lib/admin";
import { pushEnabled } from "@/lib/push";
import { isValidPhone, smsEnabled } from "@/lib/sms";

// Reminder preferences: phone number + SMS opt-in, and feature availability
// flags so Settings can show accurate state per deployment.

export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = (await db().hgetall(keys.user(userId))) ?? {};
  return NextResponse.json({
    displayName: profile.displayName ?? "",
    phone: profile.phone ?? "",
    smsReminders: profile.smsReminders === "1",
    planReminder: profile.planReminder === "off" ? "off" : "on",
    planReminderHour: Number(profile.planReminderHour ?? 7),
    pushAvailable: pushEnabled(),
    smsAvailable: smsEnabled(),
    isOwner: isOwner(userId),
  });
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    displayName?: string;
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
  return NextResponse.json({ ok: true });
}
