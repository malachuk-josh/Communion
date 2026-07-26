import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getChurch, getRole } from "@/lib/churches";
import { createThread, listThreads, validateAttach } from "@/lib/threads";

/**
 * Discussion threads in a Gathering. Readable by anyone when the Gathering is
 * public — that is most of what makes it public, and someone deciding whether
 * to join should be able to see what is talked about. A private one stays
 * shut. Writing is members-only either way; see POST below.
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
    const church = await getChurch(id);
    if (!church || church.visibility === "private") {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
  }
  return NextResponse.json({
    threads: await listThreads(id),
    myUserId: userId,
    // null, not "", so the client can tell a visitor from a member
    myRole: role,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!(await getRole(id, userId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as {
    title?: string;
    text?: string;
    attach?: unknown;
  } | null;
  const title = body?.title?.trim().slice(0, 120);
  const text = body?.text?.trim().slice(0, 4000) ?? "";
  if (!title) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }
  const attach = validateAttach(body?.attach);
  if (attach === "invalid") {
    return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });
  }
  const church = await getChurch(id);
  const thread = await createThread(
    id,
    church?.name ?? "your Gathering",
    userId,
    title,
    text,
    attach ?? undefined
  );
  return NextResponse.json({ thread }, { status: 201 });
}
