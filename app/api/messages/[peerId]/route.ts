import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getBook } from "@/lib/bible";
import { db, keys } from "@/lib/db";
import { takeRateSlot, untilNext } from "@/lib/rateLimit";
import {
  clearConversation,
  deleteMessage,
  getThread,
  isReachable,
  markRead,
  sendMessage,
  type Attachment,
} from "@/lib/messages";

/** 40 messages a minute is a fast conversation; 41 is a script. */
const MESSAGE_LIMIT = 40;
const MESSAGE_WINDOW_MS = 60_000;

/**
 * The Gatherings these two both belong to.
 *
 * Nothing is disclosed by this that the reader could not already see: every
 * Gathering listed is one they are in themselves, and its member list is
 * open to them there. What it adds is the recognising — a name in an inbox
 * with no context is a stranger, and "you are both in Wednesday Night" is
 * usually the whole answer to who this is.
 */
async function sharedGatherings(
  userId: string,
  peerId: string
): Promise<{ id: string; name: string }[]> {
  const kv = db();
  const [mine, theirs] = await Promise.all([
    kv.smembers(keys.userChurches(userId)),
    kv.smembers(keys.userChurches(peerId)),
  ]);
  const both = new Set(theirs);
  const shared = mine.filter((id) => both.has(id));
  if (shared.length === 0) return [];
  const named = await Promise.all(
    shared.map(async (id) => {
      const raw = await kv.hgetall(keys.church(id));
      return raw?.name ? { id, name: raw.name } : null;
    })
  );
  return named.filter((x): x is { id: string; name: string } => x !== null);
}

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
  const { messages, reactions } = await getThread(
    userId,
    peerId,
    since ? since + 1 : 0
  );
  // the viewer has the thread in front of them — anything here is read,
  // including messages that arrive while the thread stays open (polls)
  await markRead(userId, peerId);
  const profile = await db().hgetall(keys.user(peerId));
  return NextResponse.json({
    messages,
    // every reaction in the conversation, not just on the messages above:
    // a reaction changes an old message, so `since` must not trim these
    reactions,
    myUserId: userId,
    peerName: profile?.displayName || "Believer",
    shared: await sharedGatherings(userId, peerId),
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
    attach?: Record<string, unknown>;
  } | null;
  let text = body?.text?.trim().slice(0, 2000) ?? "";

  let attach: Attachment | undefined;
  if (body?.attach) {
    const kind = body.attach.kind;
    if (kind === "collection") {
      /*
       * A collection is sent as nothing but the token of its snapshot, and the
       * name and size on the card are read from that snapshot rather than
       * taken from the sender. The card is a claim about what is on the other
       * end of the link, and a claim the recipient cannot check before tapping
       * should not be one the sender gets to write.
       *
       * Ownership is deliberately not required. A collection you were sent is
       * a collection you may pass on — that is what being given a link means —
       * and the snapshot is public to anyone holding the token either way.
       */
      const token = String(body.attach.token ?? "");
      if (!/^[a-f0-9]{16}$/.test(token)) {
        return NextResponse.json(
          { error: "Invalid attachment" },
          { status: 400 }
        );
      }
      const stored = await db().hgetall(keys.sharedCollection(token));
      if (!stored?.data) {
        return NextResponse.json(
          { error: "That collection has not been shared" },
          { status: 404 }
        );
      }
      let snapshot: { name?: string; verses?: unknown[] };
      try {
        snapshot = JSON.parse(stored.data) as typeof snapshot;
      } catch {
        return NextResponse.json(
          { error: "That collection has not been shared" },
          { status: 404 }
        );
      }
      const name = (snapshot.name ?? "").trim().slice(0, 80) || "Collection";
      attach = {
        kind: "collection",
        token,
        name,
        count: Array.isArray(snapshot.verses) ? snapshot.verses.length : 0,
      };
      if (!text) text = name;
    } else {
      const { b, c, v, label } = body.attach as {
        b?: number;
        c?: number;
        v?: number;
        label?: string;
      };
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
        return NextResponse.json(
          { error: "Invalid attachment" },
          { status: 400 }
        );
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
  }
  if (!text) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }
  // Anyone may be written to. The Table used to reach only as far as your own
  // Gatherings, which is the right rule for a room and the wrong one for a
  // congregation: believers meet outside the groups they have joined.
  //
  // Being unlisted does not close the door either — a private profile is not
  // findable by search, which is what the person asked for, but a conversation
  // they are already in and a Gathering they already share still work. Privacy
  // here is about discovery, not about refusing to be spoken to.
  if (!(await isReachable(userId, peerId))) {
    return NextResponse.json({ error: "No such believer" }, { status: 404 });
  }
  /*
   * A ceiling on how fast one person can write.
   *
   * There was none, and a message is the loudest thing in the app: each one
   * logs a notification and pushes every device the recipient owns. A loop
   * was a phone that would not stop buzzing, and a conversation key that grew
   * for ever behind it. Generous enough that a real conversation never sees
   * it — nobody types forty messages in a minute — and low enough that
   * harassment costs something.
   */
  const slot = await takeRateSlot(
    keys.messageRate(userId),
    MESSAGE_LIMIT,
    MESSAGE_WINDOW_MS
  );
  if (!slot.ok) {
    return NextResponse.json(
      { error: `You're sending very fast. Try again in ${untilNext(slot.retryInMs)}.` },
      { status: 429 }
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
