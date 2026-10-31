import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { resolvePlan } from "@/lib/customPlans";
import { seedDefaultPlan } from "@/lib/defaultPlan";
import { cleanDays, readPlanHours, writePlanHour, type PlanHour } from "@/lib/planReminders";

/** What time of day, and on which days, each of the reader's plans asks for them. */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // A new account is enrolled in its first plan when its bookmarks are first
  // read, and the Journal can ask this a moment sooner. Enrol here too — it
  // happens once per account, whichever asks first — or that plan would come
  // back with no hour, and its reminders could not be set until a reload.
  await seedDefaultPlan(userId).catch(() => {});
  return NextResponse.json(await readPlanHours(userId));
}

/** Set one plan's hour and, if given, its days; or switch it off. */
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    planId?: string;
    hour?: number | "off";
    tz?: string;
    /** days of the week it asks on, Sunday 0; left out, they stay as they are */
    days?: unknown;
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

  const days = body?.days === undefined ? undefined : cleanDays(body.days);
  if (days === null) {
    return NextResponse.json({ error: "Which days?" }, { status: 400 });
  }

  await writePlanHour(userId, planId, hour, body?.tz, days);
  return NextResponse.json({ ok: true, planId, hour, ...(days ? { days } : {}) });
}
