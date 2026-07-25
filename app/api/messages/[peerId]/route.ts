import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getBook } from "@/lib/bible";
import { db, keys } from "@/lib/db";
import {
  clearConversation,
  deleteMessage,
  getThread,
  markRead,
  sendMessage,
  sharesChurch,
  type ChatMessage,
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
  const body = (await req.json().catch(() => null)) as {
    text?: string;
    attach?: ChatMessage["attach"];
  } | null;
  let text = body?.text?.trim().slice(0, 2000) ?? "";

  let attach: ChatMessage["attach"];
  if (body?.attach) {
    const { b, c, v, kind, label } = body.attach;
    const book = getBook(Number(b));
    if (
      !book ||
      !c ||
      !v ||
      c < 1 ||
      c > book.chapters ||
      v < 1 ||
      v > 200 ||
      (kind !== "bookmark" && kind !== "note" && kind !== "word")
    ) {
      return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });
    }
    attach = {
      b: Number(b),
      c: Number(c),
      v: Number(v),
      kind,
      label: label?.trim().slice(0, 1000) || undefined,
    };
    if (!text) text = `${book.en} ${c}:${v}`;
  }
  if (!text) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }
  if (!(await sharesChurch(userId, peerId))) {
    return NextResponse.json(
      { error: "You can only message members of your Gatherings" },
      { status: 403 }
    );
  }
  const message = await sendMessage(userId, peerId, text, attach);
  return NextResponse.json({ message }, { status: 201 });
}

/**
 * With { messageId }: delete that message (author only). Without it:
 * clear the whole conversation from this user's inbox and history.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ peerId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { peerId } = await params;
  const body = (await req.json().catch(() => null)) as {
    messageId?: string;
  } | null;

  if (body?.messageId) {
    const ok = await deleteMessage(userId, peerId, body.messageId);
    if (!ok) {
      return NextResponse.json(
        { error: "You can only delete your own messages" },
        { status: 403 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  await clearConversation(userId, peerId);
  return NextResponse.json({ ok: true });
}
