import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";
import {
  getThread,
  markRead,
  sendMessage,
  sharesChurch,
} from "@/lib/messages";

/** Thread with one person; ?since=ts returns only newer messages. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ peerId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { peerId } = await params;
  const since = Number(new URL(req.url).searchParams.get("since")) || 0;
  const messages = await getThread(userId, peerId, since ? since + 1 : 0);
  // the viewer has the thread in front of them — anything here is read,
  // including messages that arrive while the thread stays open (polls)
  await markRead(userId, peerId);
  const profile = await db().hgetall(keys.user(peerId));
  return NextResponse.json({
    messages,
    myUserId: userId,
    peerName: profile?.displayName || "Believer",
    peerIcon: profile?.icon || null,
  });
}

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
    return NextResponse.json({ error: "Invalid recipient" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as { text?: string } | null;
  const text = body?.text?.trim().slice(0, 2000);
  if (!text) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }
  if (!(await sharesChurch(userId, peerId))) {
    return NextResponse.json(
      { error: "You can only message members of your Fellowships" },
      { status: 403 }
    );
  }
  const message = await sendMessage(userId, peerId, text);
  return NextResponse.json({ message }, { status: 201 });
}
