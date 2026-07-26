import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getChurch, getRole } from "@/lib/churches";
import {
  addPost,
  deleteThread,
  getPosts,
  getThreadMeta,
  validateAttach,
} from "@/lib/threads";

/**
 * One discussion thread with its posts. Open to anyone when the Gathering is
 * public, closed when it is private — the same rule as the thread list.
 * Replying and deleting stay members-only.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { threadId } = await params;
  const meta = await getThreadMeta(threadId);
  if (!meta) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const church = await getChurch(meta.churchId);
  const role = await getRole(meta.churchId, userId);
  if (!role && (!church || church.visibility === "private")) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  return NextResponse.json({
    thread: meta,
    posts: await getPosts(threadId),
    churchName: church?.name ?? "",
    myUserId: userId,
    canDelete: !!role && (meta.createdBy === userId || role === "founder"),
    isAdmin: role === "founder",
    canPost: !!role,
  });
}

/** Delete a discussion — its author or the Gathering's founder. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { threadId } = await params;
  const meta = await getThreadMeta(threadId);
  if (!meta) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const role = await getRole(meta.churchId, userId);
  if (meta.createdBy !== userId && role !== "founder") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  await deleteThread(threadId, meta.churchId);
  return NextResponse.json({ ok: true });
}

/** Reply to a thread. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { threadId } = await params;
  const meta = await getThreadMeta(threadId);
  if (!meta) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await getRole(meta.churchId, userId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as {
    text?: string;
    attach?: unknown;
  } | null;
  const text = body?.text?.trim().slice(0, 4000) ?? "";
  const attach = validateAttach(body?.attach);
  if (attach === "invalid") {
    return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });
  }
  if (!text && !attach) {
    return NextResponse.json({ error: "Empty post" }, { status: 400 });
  }
  const church = await getChurch(meta.churchId);
  const post = await addPost(
    threadId,
    meta.churchId,
    church?.name ?? "your Gathering",
    userId,
    text,
    attach ?? undefined
  );
  return NextResponse.json({ post }, { status: 201 });
}
