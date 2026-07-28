import { NextResponse } from "next/server";
import { isTrusted } from "@/lib/admin";
import { getUserId } from "@/lib/auth";
import {
  deleteChurch,
  getChurch,
  getChurchDetail,
  updateChurch,
} from "@/lib/churches";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    description?: string;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const updated = await updateChurch(id, userId, body);
  if (!updated) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // no auth requirement: public churches show a limited profile to anyone
  const userId = await getUserId(req);
  const { id } = await params;
  const church = await getChurchDetail(id, userId);
  if (!church) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ church, myUserId: userId });
}

/**
 * Delete a Gathering. Its founder, or the app's owner — a member leaving is
 * /leave, which is a different thing and already exists.
 *
 * The owner is not here to overrule founders. It is because founder-only is
 * not a complete rule: a Gathering whose founder is a guest identity cannot be
 * deleted by anybody once real accounts are switched on, since a guest can no
 * longer sign in to be that founder. Without this, such a record is permanent
 * — visible in the open directory, and unreachable by every route that could
 * remove it.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const church = await getChurch(id);
  if (!church) {
    return NextResponse.json({ error: "No such Gathering" }, { status: 404 });
  }
  if (church.founderId !== userId && !(await isTrusted(userId))) {
    return NextResponse.json(
      { error: "Only the founder can delete a Gathering" },
      { status: 403 }
    );
  }
  await deleteChurch(id);
  return NextResponse.json({ ok: true });
}
