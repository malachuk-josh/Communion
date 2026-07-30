import { NextResponse } from "next/server";
import { getDisplayName, getUserId, nameNotAddress } from "@/lib/auth";
import { db, keys } from "@/lib/db";
import { isPlanId } from "@/lib/planReminders";
import {
  MAX_DAYS,
  MAX_PLANS,
  cleanDays,
  cleanName,
  isCustomId,
  newCustomId,
  listPlan,
  publishPlan,
  readCustomPlan,
  readCustomPlans,
  unlistPlan,
  unpublishPlan,
  writeCustomPlan,
  type CustomPlan,
} from "@/lib/customPlans";
import type { Ref } from "@/lib/customPlanTypes";

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
    /** whether to list it where anyone can find it */
    listed?: boolean;
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

  /*
   * Listing is publishing plus a card on the shelf.
   *
   * A listed plan needs a token, because taking a copy of one goes through
   * exactly the same door as taking a copy from a link somebody sent you —
   * there is no second kind of sharing here, only a second way of finding
   * the first.
   */
  const listed = body?.listed ?? editing?.listed ?? false;
  if (listed) plan.listed = true;
  await writeCustomPlan(userId, plan);

  // A link already sent has to show what the plan now says. The token stays
  // the same, so nobody's copy of the address goes stale — but the snapshot
  // behind it is rewritten, or everyone holding the link would go on reading
  // the version this edit was meant to correct.
  const sharedBy = await getDisplayName(req);
  if (plan.share || listed) {
    const token = await publishPlan(plan, sharedBy);
    if (!plan.share) {
      plan.share = token;
      await writeCustomPlan(userId, plan);
    }
    if (listed) {
      await listPlan(token, {
        name: plan.name,
        sharedBy: nameNotAddress(sharedBy),
        days: plan.days.length,
        at: plan.createdAt,
      });
    } else if (editing?.listed) {
      // Taken off the shelf, but the link goes on working: listing and
      // sending somebody an address are two different acts, and undoing one
      // is not a reason to break the other.
      await unlistPlan(token);
    }
  }

  // A plan nobody is walking is a plan nobody hears from. Enrolling on save
  // is what the reader meant by building it — and it is how the row appears
  // in the Journal, where the hour and the day count live.
  const progress = await db().hgetall(keys.userPlans(userId));
  if (progress?.[plan.id] === undefined) {
    await db().hset(keys.userPlans(userId), { [plan.id]: 0 });
    await db().sadd(keys.planUsers, userId);
  } else if (editing) {
    /*
     * Where the reader now stands, after the plan under them has moved.
     *
     * Progress is an index, so an edit that removes days from the front of a
     * plan silently moves everybody's place. Tidying away the five days you
     * have already read — the obvious thing to do — left progress at 25 in a
     * plan that was now 25 days long, so it read as finished: the reader's
     * five unread days were unreachable, the mark-read button was gone and
     * the reminder stopped for good.
     *
     * What has to survive an edit is not the number but the reading it
     * pointed at, so the next unread day is looked up by its contents in the
     * new list. A plan whose next day was itself deleted falls back to
     * clamping, which is the best that can be said about a day that no
     * longer exists.
     */
    const key = (day: { b: number; c: number }[] | Ref[]) =>
      (day as Ref[]).map((r) => (Array.isArray(r) ? r.join(":") : r)).join("|");
    const done = Number(progress[plan.id]) || 0;
    const wasNext = editing.days[done];
    let next: number;
    if (!wasNext) {
      // They had finished it. Clamped rather than moved to the end, so that
      // adding a day to a plan you have finished gives you a day to read —
      // which is the only reason anybody adds one.
      next = Math.min(done, plan.days.length);
    } else {
      const found = plan.days.findIndex((d) => key(d) === key(wasNext));
      next = found >= 0 ? found : Math.min(done, plan.days.length);
    }
    if (next !== done) {
      await db().hset(keys.userPlans(userId), { [plan.id]: next });
    }
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
