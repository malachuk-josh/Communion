import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";
import { getPlan } from "@/lib/plans";

/** Mark today's reading complete, or reset a plan. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const plan = getPlan(id);
  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => null)) as {
    action?: string;
  } | null;

  const kv = db();
  if (body?.action === "reset") {
    await kv.hset(keys.userPlans(userId), { [id]: 0 });
    return NextResponse.json({ completed: 0 });
  }
  if (body?.action !== "complete") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const raw = await kv.hgetall(keys.userPlans(userId));
  const current = Number(raw?.[id]) || 0;
  const completed = Math.min(current + 1, plan.days.length);
  await kv.hset(keys.userPlans(userId), { [id]: completed });
  return NextResponse.json({ completed });
}
