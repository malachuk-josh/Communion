import { NextResponse } from "next/server";
import { getDisplayName, getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";
import { isPlanId } from "@/lib/planReminders";
import {
  MAX_DAYS,
  MAX_PLANS,
  cleanDays,
  cleanName,
  isCustomId,
  newCustomId,
  publishPlan,
  readCustomPlan,
  readCustomPlans,
  unpublishPlan,
  writeCustomPlan,
  type CustomPlan,
} from "@/lib/customPlans";

/** The plans this reader has written, newest first. */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const plans = Object.values(await readCustomPlans(userId)).sort(
    (a, b) => b.createdAt - a.createdAt
  );
  return NextResponse.json({ plans });
}

/**
 * Write one — new if no id is sent, an edit to an existing one if there is.
 *
 * Editing keeps the id, which means it keeps the reader's progress and the
 * hour it asks at. It also keeps the share token, so a link already sent to
 * somebody goes on working and shows the corrected plan rather than
 * quietly becoming a second, older one.
 */
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    name?: string;
    days?: unknown;
  } | null;

  const name = cleanName(body?.name);
  const days = cleanDays(body?.days);
  if (!name) {
    return NextResponse.json({ error: "Give it a name." }, { status: 400 });
  }
  if (days.length === 0) {
    return NextResponse.json(
      { error: "Add at least one day of reading." },
      { status: 400 }
    );
  }

  const mine = await readCustomPlans(userId);
  const editing = body?.id && isCustomId(body.id) ? mine[body.id] : undefined;
  if (body?.id && !editing) {
    return NextResponse.json({ error: "No such plan." }, { status: 404 });
  }
  // Only new plans count against the ceiling: somebody at the limit must
  // still be able to correct what they already have.
  if (!editing && Object.keys(mine).length >= MAX_PLANS) {
    return NextResponse.json(
      { error: `You can keep ${MAX_PLANS} plans of your own.` },
      { status: 409 }
    );
  }

  const plan: CustomPlan = {
    id: editing?.id ?? newCustomId(),
    name,
    days: days.slice(0, MAX_DAYS),
    createdAt: editing?.createdAt ?? Date.now(),
    ...(editing?.share ? { share: editing.share } : {}),
    ...(editing?.fromName ? { fromName: editing.fromName } : {}),
    // Carried through an edit, or following the link again would hand the
    // reader a second copy of a plan they had only renamed.
    ...(editing?.fromToken ? { fromToken: editing.fromToken } : {}),
  };
  await writeCustomPlan(userId, plan);

  // A link already sent has to show what the plan now says. The token stays
  // the same, so nobody's copy of the address goes stale — but the snapshot
  // behind it is rewritten, or everyone holding the link would go on reading
  // the version this edit was meant to correct.
  if (plan.share) {
    await publishPlan(plan, await getDisplayName(req));
  }

  // A plan nobody is walking is a plan nobody hears from. Enrolling on save
  // is what the reader meant by building it — and it is how the row appears
  // in the Journal, where the hour and the day count live.
  const progress = await db().hgetall(keys.userPlans(userId));
  if (progress?.[plan.id] === undefined) {
    await db().hset(keys.userPlans(userId), { [plan.id]: 0 });
    await db().sadd(keys.planUsers, userId);
  }
  return NextResponse.json({ plan }, { status: editing ? 200 : 201 });
}

/**
 * Delete one outright.
 *
 * Different from leaving it, which only stops the asking. This takes the plan
 * itself, so its progress and its reminder go with it — there is nothing left
 * for them to be about.
 */
export async function DELETE(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!isCustomId(id)) {
    return NextResponse.json({ error: "No such plan." }, { status: 400 });
  }
  const kv = db();
  const plan = await readCustomPlan(userId, id);
  await kv.hdel(keys.userCustomPlans(userId), id);
  for (const field of [id, `${id}:on`, `${id}:at`, `${id}:nudged`]) {
    await kv.hdel(keys.userPlans(userId), field);
  }
  // The published copy goes with it. "This cannot be undone" has to mean the
  // plan is gone, not that it is gone from the author's account and still
  // readable by anybody holding the link they sent last week.
  if (plan?.share) await unpublishPlan(plan.share);

  // Nothing left to be nudged about: come out of the set the sweep reads, the
  // same way leaving a catalogue plan does (app/api/sync/route.ts).
  const left = (await kv.hgetall(keys.userPlans(userId))) ?? {};
  if (!Object.keys(left).some(isPlanId)) {
    await kv.srem(keys.planUsers, userId);
  }
  return NextResponse.json({ ok: true });
}
