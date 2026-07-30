import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";
import {
  MAX_DAYS,
  MAX_PLANS,
  cleanDays,
  cleanName,
  newCustomId,
  readCustomPlans,
  readSharedPlan,
  writeCustomPlan,
  type CustomPlan,
} from "@/lib/customPlans";

/** Public read of a shared plan — no account needed to look at one. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const snapshot = await readSharedPlan(token);
  if (!snapshot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(snapshot);
}

/**
 * Take a copy.
 *
 * A copy, and not a subscription: it becomes the reader's own plan, with its
 * own id, its own progress and its own hour, and the person who shared it
 * cannot afterwards change what this reader is walking. Whose it was is kept
 * on it, because a plan somebody gave you is worth knowing the giver of.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { token } = await params;
  const snapshot = await readSharedPlan(token);
  if (!snapshot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const days = cleanDays(snapshot.days);
  if (days.length === 0) {
    return NextResponse.json({ error: "Nothing to copy." }, { status: 400 });
  }

  const mine = await readCustomPlans(userId);
  /*
   * Already taken: hand back the copy they have rather than making a second.
   * Following the same link twice is somebody checking, not collecting.
   *
   * Matched on the token, which is the only thing that actually identifies
   * the link. Matching on the sharer's name and the plan's name — the first
   * thing this did — was wrong in both directions at once: two people called
   * Believer sharing two different plans with the same title meant the second
   * one could never be taken, and renaming your copy meant the same link
   * would hand you a second.
   */
  const held = Object.values(mine).find((p) => p.fromToken === token);
  if (held) return NextResponse.json({ plan: held, already: true });

  if (Object.keys(mine).length >= MAX_PLANS) {
    return NextResponse.json(
      { error: `You can keep ${MAX_PLANS} plans of your own.` },
      { status: 409 }
    );
  }

  const plan: CustomPlan = {
    id: newCustomId(),
    name: cleanName(snapshot.name) || "Shared plan",
    days: days.slice(0, MAX_DAYS),
    createdAt: Date.now(),
    fromName: snapshot.sharedBy,
    fromToken: token,
  };
  await writeCustomPlan(userId, plan);

  const kv = db();
  const progress = await kv.hgetall(keys.userPlans(userId));
  if (progress?.[plan.id] === undefined) {
    await kv.hset(keys.userPlans(userId), { [plan.id]: 0 });
    await kv.sadd(keys.planUsers, userId);
  }
  return NextResponse.json({ plan }, { status: 201 });
}
