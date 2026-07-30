import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { resolvePlan } from "@/lib/customPlans";
import { readPlanHours, writePlanHour, type PlanHour } from "@/lib/planReminders";

/** What time of day each of the reader's plans asks for them. */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await readPlanHours(userId));
}

/** Set one plan's hour, or switch it off. */
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    planId?: string;
    hour?: number | "off";
    tz?: string;
  } | null;

  const planId = String(body?.planId ?? "");
  // A plan that does not exist cannot be reminded about, and a field name
  // with a colon in it would land on top of another plan's attribute.
  if (!planId || planId.includes(":") || !(await resolvePlan(userId, planId))) {
    return NextResponse.json({ error: "No such plan." }, { status: 400 });
  }

  let hour: PlanHour;
  if (body?.hour === "off") {
    hour = "off";
  } else {
    const n = Number(body?.hour);
    if (!Number.isInteger(n) || n < 0 || n > 23) {
      return NextResponse.json({ error: "Not an hour." }, { status: 400 });
    }
    hour = n;
  }

  await writePlanHour(userId, planId, hour, body?.tz);
  return NextResponse.json({ ok: true, planId, hour });
}
