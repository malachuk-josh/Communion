import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";
import { isPlanId } from "@/lib/planReminders";

/** The user's reading-plan progress: { planId: completedDays } */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const raw = (await db().hgetall(keys.userPlans(userId))) ?? {};
  const progress: Record<string, number> = {};
  for (const [planId, count] of Object.entries(raw)) {
    // ":on", ":at" and ":nudged" are facts about a plan, not plans. Testing
    // for the colon rather than for each suffix in turn, so that the next
    // one added here cannot arrive on the device looking like a plan.
    if (!isPlanId(planId)) continue;
    progress[planId] = Number(count) || 0;
  }
  // `who` lets the device notice it is holding a different account's copy
  return NextResponse.json({ who: userId, progress });
}
