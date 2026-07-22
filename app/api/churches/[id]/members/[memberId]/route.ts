import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { removeMember } from "@/lib/churches";

/** Founder removes a member from the church. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, memberId } = await params;
  const removed = await removeMember(id, userId, memberId);
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
