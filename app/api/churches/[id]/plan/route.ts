import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getChurch, getRole } from "@/lib/churches";
import { resolvePlan } from "@/lib/customPlans";
import { db, keys } from "@/lib/db";

/**
 * Where the Gathering is up to.
 *
 * A Gathering reading together is the same reading with company, so nothing
 * about progress is stored twice: each member's day is read from their own
 * plan record, the one the Journal and the reminders already use. Somebody
 * who was nine days into this plan before the Gathering picked it arrives on
 * day nine, and somebody who leaves keeps every day they read.
 *
 * That is also what makes this honest rather than a scoreboard. There is no
 * rank and no streak — only the list of who is where, which is the thing a
 * group actually needs in order to wait for each other.
 *
 * Members only, like the prayer list. What a room is reading is not a secret,
 * but how far along each person is belongs to the room.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const role = await getRole(id, userId);
  if (!role) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const church = await getChurch(id);
  if (!church) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!church.planId) {
    return NextResponse.json({ plan: null, myRole: role });
  }

  /*
   * Resolved against the founder, not the viewer.
   *
   * A founder may set a plan they wrote themselves, and a custom plan lives
   * in its author's own records — asked for as anybody else, it would not
   * resolve, and the Gathering would show a plan nobody but the founder could
   * see. Reading it as the founder is what makes "we are reading this
   * together" true for everyone in the room.
   */
  const plan = await resolvePlan(church.founderId, church.planId);
  if (!plan) {
    return NextResponse.json({ plan: null, myRole: role, missing: true });
  }

  const kv = db();
  const members = (await kv.hgetall(keys.churchMembers(id))) ?? {};
  const walking = await Promise.all(
    Object.keys(members).map(async (memberId) => {
      const [profile, progress] = await Promise.all([
        kv.hgetall(keys.user(memberId)),
        kv.hgetall(keys.userPlans(memberId)),
      ]);
      const done = Number(progress?.[church.planId!]) || 0;
      return {
        userId: memberId,
        displayName: profile?.displayName || "Believer",
        // days finished, so "day 1" is somebody who has read nothing yet
        done: Math.min(done, plan.days.length),
        // enrolled at all? absent means they have not started this one
        started: progress?.[church.planId!] !== undefined,
      };
    })
  );

  // furthest along first, then by name — a list to catch up with, not a rank
  walking.sort(
    (a, b) => b.done - a.done || a.displayName.localeCompare(b.displayName)
  );

  return NextResponse.json({
    plan: { id: plan.id, name: plan.name, icon: plan.icon, days: plan.days.length },
    members: walking,
    myRole: role,
  });
}

/** Founder only: set the plan the Gathering is reading, or clear it. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if ((await getRole(id, userId)) !== "founder") {
    return NextResponse.json({ error: "Founder only" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as {
    planId?: string | null;
  } | null;

  const wanted = (body?.planId ?? "").trim();
  if (wanted) {
    // A plan the founder cannot open is a plan the Gathering cannot read.
    if (!(await resolvePlan(userId, wanted))) {
      return NextResponse.json({ error: "No such plan" }, { status: 400 });
    }
  }
  await db().hset(keys.church(id), { planId: wanted.slice(0, 64) });

  /*
   * Everybody is told, because being asked to read something together is the
   * whole of the invitation — there is no other moment it happens, and a plan
   * set silently is a plan only the founder knows about.
   */
  if (wanted) {
    const plan = await resolvePlan(userId, wanted);
    const church = await getChurch(id);
    const members = (await db().hgetall(keys.churchMembers(id))) ?? {};
    const { sendPushToUser } = await import("@/lib/push");
    for (const memberId of Object.keys(members)) {
      if (memberId === userId) continue;
      await sendPushToUser(memberId, {
        title: `📖 ${church?.name ?? "Your Gathering"}`,
        body: `Reading ${plan?.name} together — ${plan?.days.length} days.`,
        url: `/churches/${id}`,
        tag: `plan-${id}`,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, planId: wanted });
}
