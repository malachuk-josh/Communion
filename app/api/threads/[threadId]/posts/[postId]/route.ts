import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getRole } from "@/lib/churches";
import { deletePost, getThreadMeta } from "@/lib/threads";

/** Delete one message in a discussion — its author or the Fellowship admin. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ threadId: string; postId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { threadId, postId } = await params;
  const meta = await getThreadMeta(threadId);
  if (!meta) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const role = await getRole(meta.churchId, userId);
  if (!role) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  const ok = await deletePost(threadId, postId, userId, role === "founder");
  if (!ok) {
    return NextResponse.json(
      { error: "You can only delete your own messages" },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: true });
}
