import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";

/** The user's reading-plan progress: { planId: completedDays } */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const raw = (await db().hgetall(keys.userPlans(userId))) ?? {};
  const progress: Record<string, number> = {};
  for (const [planId, count] of Object.entries(raw)) {
    progress[planId] = Number(count) || 0;
  }
  return NextResponse.json({ progress });
}
