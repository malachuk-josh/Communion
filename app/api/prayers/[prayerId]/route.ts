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
 * Not being a member is no longer a closed door. A request asked in an open
 * Gathering reaches the prayer wall, where anyone may read it — and a request
 * you can read but cannot pray for would be a strange thing to show somebody.
 * So an outsider is admitted to an open Gathering's requests, with no standing
 * to moderate them: the checks below still turn on being the author or the
 * founder, and this hands out neither.
 *
 * A private Gathering is unchanged — members only, as it never appears on the
 * wall to anybody else in the first place.
 */
async function standing(req: Request, prayerId: string) {
  const userId = await getUserId(req);
  if (!userId) return { error: "Unauthorized" as const, status: 401 };
  const raw = await db().hgetall(keys.prayer(prayerId));
  if (!raw?.text) return { error: "Not found" as const, status: 404 };
  const churchId = raw.churchId ?? "";
  // a leftover from the old open wall, which belonged to no Gathering
  if (!churchId) return { userId, churchId, isAdmin: isOwner(userId) };
  const role = await getRole(churchId, userId);
  if (!role) {
    const church = await getChurch(churchId);
    if (!church || church.visibility === "private") {
      return { error: "Not a member" as const, status: 403 };
    }
    return { userId, churchId, isAdmin: false };
  }
  return { userId, churchId, isAdmin: role === "founder" };
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
