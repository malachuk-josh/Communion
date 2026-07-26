import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";
import { getRole } from "@/lib/churches";
import {
  answerPrayer,
  deletePrayer,
  reopenPrayer,
  togglePrayed,
} from "@/lib/prayers";

/** The Gathering a request belongs to, and this user's standing in it. */
async function standing(req: Request, prayerId: string) {
  const userId = await getUserId(req);
  if (!userId) return { error: "Unauthorized" as const, status: 401 };
  const raw = await db().hgetall(keys.prayer(prayerId));
  if (!raw?.text) return { error: "Not found" as const, status: 404 };
  const churchId = raw.churchId ?? "";
  const role = await getRole(churchId, userId);
  if (!role) return { error: "Not a member" as const, status: 403 };
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
