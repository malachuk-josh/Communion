import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";
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
    pushAvailable: pushEnabled(),
    smsAvailable: smsEnabled(),
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
  await db().hset(keys.user(userId), updates);
  return NextResponse.json({ ok: true });
}
