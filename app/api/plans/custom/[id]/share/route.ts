import { NextResponse } from "next/server";
import { getDisplayName, getUserId } from "@/lib/auth";
import {
  publishPlan,
  readCustomPlan,
  writeCustomPlan,
} from "@/lib/customPlans";

/**
 * Publish a plan and hand back the link.
 *
 * The token is minted once and kept on the plan, so sharing the same plan
 * twice gives the same address rather than scattering copies of it — and a
 * later share rewrites the snapshot under it, which is how somebody who
 * corrects a plan corrects it for everyone still holding the link.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const plan = await readCustomPlan(userId, id);
  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = await publishPlan(plan, await getDisplayName(req));
  if (!plan.share) {
    await writeCustomPlan(userId, { ...plan, share: token });
  }
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  return NextResponse.json({
    url: `${origin}/plans/${token}`,
    days: plan.days.length,
  });
}
