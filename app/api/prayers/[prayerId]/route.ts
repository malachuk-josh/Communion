import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";
import { isOwner } from "@/lib/admin";
import { getChurch, getRole } from "@/lib/churches";
import {
  answerPrayer,
  deletePrayer,
  reopenPrayer,
  togglePrayed,
} from "@/lib/prayers";

/**
 * The Gathering a request belongs to, and this user's standing in it.
 *
 * Members only, whether the Gathering is open or not — the same rule the
 * wall and the per-Gathering list now keep. This route used to admit an
 * outsider to an open Gathering's requests on the grounds that they could
 * read them on the wall anyway; they cannot, and a door left open behind a
 * closed one is just a door.
 *
 * Two ways to be an admin here. The founder of the Gathering, which is what
 * moderating a room means. And the owner of the app, who was named as an
 * admin only for the leftover requests that belong to no Gathering at all —
 * so the wall offered them a delete button on everything, and every use of it
 * came back 403. Saying yes here is what the wall was already promising.
 */
async function standing(req: Request, prayerId: string) {
  const userId = await getUserId(req);
  if (!userId) return { error: "Unauthorized" as const, status: 401 };
  const raw = await db().hgetall(keys.prayer(prayerId));
  if (!raw?.text) return { error: "Not found" as const, status: 404 };
  const owner = isOwner(userId);
  const churchId = raw.churchId ?? "";
  // a leftover from the old open wall, which belonged to no Gathering
  if (!churchId) return { userId, churchId, isAdmin: owner };
  const role = await getRole(churchId, userId);
  if (!role) {
    if (!owner) return { error: "Not a member" as const, status: 403 };
    const church = await getChurch(churchId);
    if (!church) return { error: "Not found" as const, status: 404 };
    return { userId, churchId, isAdmin: true };
  }
  return { userId, churchId, isAdmin: role === "founder" || owner };
}

/** Pray for it, answer it, or reopen it. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ prayerId: string }> }
) {
  const { prayerId } = await params;
  const who = await standing(req, prayerId);
  if ("error" in who) {
    return NextResponse.json({ error: who.error }, { status: who.status });
  }
  const body = (await req.json().catch(() => null)) as {
    action?: string;
    answer?: string;
  } | null;

  if (body?.action === "pray") {
    const state = await togglePrayed(prayerId, who.userId);
    if (!state) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(state);
  }
  if (body?.action === "answer") {
    const ok = await answerPrayer(
      prayerId,
      who.userId,
      who.isAdmin,
      body.answer ?? ""
    );
    if (!ok) return NextResponse.json({ error: "Not yours" }, { status: 403 });
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "reopen") {
    const ok = await reopenPrayer(prayerId, who.userId, who.isAdmin);
    if (!ok) return NextResponse.json({ error: "Not yours" }, { status: 403 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ prayerId: string }> }
) {
  const { prayerId } = await params;
  const who = await standing(req, prayerId);
  if ("error" in who) {
    return NextResponse.json({ error: who.error }, { status: who.status });
  }
  const ok = await deletePrayer(prayerId, who.userId, who.isAdmin);
  if (!ok) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
