import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { isReachable, isReaction, react } from "@/lib/messages";

/**
 * Answer a message with one of the five, or take the answer back.
 *
 * Its own route rather than a verb on the thread, because it is the one write
 * to a conversation that is not a message: it makes no notification, moves
 * nothing in the inbox, and changes no unread count. Nothing about the
 * conversation's shape changes — only what is already in it.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ peerId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { peerId } = await params;
  if (peerId === userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // The same gate the thread itself is behind: somebody who may not read a
  // conversation may not leave anything in it either.
  if (!(await isReachable(userId, peerId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as {
    messageId?: string;
    kind?: string | null;
  } | null;
  const messageId = String(body?.messageId ?? "");
  if (!messageId) {
    return NextResponse.json({ error: "No such message." }, { status: 400 });
  }
  const kind = body?.kind ?? null;
  if (kind !== null && !isReaction(kind)) {
    return NextResponse.json({ error: "Not a reaction." }, { status: 400 });
  }

  const done = await react(userId, peerId, messageId, kind);
  if (!done) {
    return NextResponse.json({ error: "No such message." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
