// Direct messages between believers who share a Church. Conversations are
// unordered user pairs; messages live in a zset scored by timestamp, and
// each participant keeps a per-conversation summary (peer, last message,
// unread count) for the inbox list.

import { randomUUID } from "crypto";
import { db, keys } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";

/**
 * What a message carries besides its words.
 *
 * A verse attachment is a place in scripture, so it travels as that place and
 * needs nothing stored anywhere to be readable. A collection has no single
 * place — it is a shelf of them — so it travels as the token of its published
 * snapshot instead, and carries the name and size it had when it was sent, so
 * the card in the thread reads correctly before anything is fetched.
 */
export type Attachment =
  | {
      kind: "bookmark" | "note" | "word";
      b: number;
      c: number;
      v: number;
      label?: string;
    }
  | { kind: "collection"; token: string; name: string; count: number };

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  ts: number;
  /** a shared card: a verse you kept, a note on one, a word, or a collection */
  attach?: Attachment;
}

export interface ConvSummary {
  peerId: string;
  peerName: string;
  lastText: string;
  lastFrom: string;
  ts: number;
  unread: number;
}

export interface Contact {
  userId: string;
  displayName: string;
}

export function convIdFor(a: string, b: string): string {
  return [a, b].sort().join("~");
}

async function profileOf(userId: string): Promise<{ name: string }> {
  const profile = await db().hgetall(keys.user(userId));
  return { name: profile?.displayName || "Believer" };
}

/** Everyone who shares at least one Church with the user. */
export async function listContacts(userId: string): Promise<Contact[]> {
  const kv = db();
  const churchIds = await kv.smembers(keys.userChurches(userId));
  const seen = new Map<string, Contact>();
  for (const churchId of churchIds) {
    const members = (await kv.hgetall(keys.churchMembers(churchId))) ?? {};
    for (const memberId of Object.keys(members)) {
      if (memberId === userId || seen.has(memberId)) continue;
      const p = await profileOf(memberId);
      seen.set(memberId, { userId: memberId, displayName: p.name });
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );
}

/**
 * Whether there is somebody at this address.
 *
 * The Table used to refuse anyone outside your own Gatherings, and that rule —
 * whatever else it did — meant a recipient was always a real person. With it
 * gone, a made-up id would open a conversation with nobody: a summary in the
 * sender's inbox, a name of "Believer", and messages into a room no one is in.
 *
 * Anyone who has used this app has a name stored, whether they set it in
 * settings or gave it when they joined a Gathering. An open conversation
 * counts too, so a thread that predates this can never be closed by it.
 */
export async function isReachable(from: string, to: string): Promise<boolean> {
  const kv = db();
  const profile = await kv.hgetall(keys.user(to));
  if (profile?.displayName) return true;
  const convs = await kv.hgetall(keys.userConvs(from));
  return !!convs?.[convIdFor(from, to)];
}

export async function listConversations(
  userId: string
): Promise<ConvSummary[]> {
  const raw = (await db().hgetall(keys.userConvs(userId))) ?? {};
  const convs: ConvSummary[] = [];
  for (const value of Object.values(raw)) {
    try {
      convs.push(JSON.parse(value) as ConvSummary);
    } catch {
      // corrupted summary — skip
    }
  }
  return convs.sort((a, b) => b.ts - a.ts);
}

/** When this user last cleared the conversation (0 = never). */
async function clearedAt(userId: string, convId: string): Promise<number> {
  const profile = await db().hgetall(keys.user(userId));
  return Number(profile?.[`cleared:${convId}`]) || 0;
}

export async function getThread(
  userId: string,
  peerId: string,
  since = 0
): Promise<ChatMessage[]> {
  const kv = db();
  const convId = convIdFor(userId, peerId);
  const floor = await clearedAt(userId, convId);
  const raw = await kv.zrangebyscore(
    keys.convMessages(convId),
    Math.max(since, floor + (floor ? 1 : 0)),
    Number.MAX_SAFE_INTEGER
  );
  const messages: ChatMessage[] = [];
  for (const item of raw) {
    try {
      messages.push(JSON.parse(item) as ChatMessage);
    } catch {
      // corrupted message — skip
    }
  }
  return messages.sort((a, b) => a.ts - b.ts);
}

/** Remove one message from the shared thread — its author only. */
export async function deleteMessage(
  userId: string,
  peerId: string,
  messageId: string
): Promise<boolean> {
  const kv = db();
  const convId = convIdFor(userId, peerId);
  const raw = await kv.zrangebyscore(
    keys.convMessages(convId),
    0,
    Number.MAX_SAFE_INTEGER
  );
  for (const item of raw) {
    try {
      const message = JSON.parse(item) as ChatMessage;
      if (message.id !== messageId) continue;
      if (message.from !== userId) return false;
      await kv.zrem(keys.convMessages(convId), item);
      // keep both inboxes honest about what the last message now is
      const remaining = raw
        .filter((r) => r !== item)
        .map((r) => {
          try {
            return JSON.parse(r) as ChatMessage;
          } catch {
            return null;
          }
        })
        .filter((m): m is ChatMessage => m !== null)
        .sort((a, b) => a.ts - b.ts);
      const last = remaining[remaining.length - 1];
      for (const side of [userId, peerId]) {
        const summaries = (await kv.hgetall(keys.userConvs(side))) ?? {};
        if (!summaries[convId]) continue;
        try {
          const summary = JSON.parse(summaries[convId]) as ConvSummary;
          if (last) {
            summary.lastText = last.text;
            summary.lastFrom = last.from;
            summary.ts = last.ts;
          } else {
            summary.lastText = "";
          }
          await kv.hset(keys.userConvs(side), {
            [convId]: JSON.stringify(summary),
          });
        } catch {
          // corrupted summary — leave it
        }
      }
      return true;
    } catch {
      // corrupted entry — keep looking
    }
  }
  return false;
}

/**
 * Hide a conversation from this user's inbox and history. The other
 * person keeps their copy; a new message brings the thread back.
 */
export async function clearConversation(
  userId: string,
  peerId: string
): Promise<void> {
  const kv = db();
  const convId = convIdFor(userId, peerId);
  await kv.hset(keys.user(userId), { [`cleared:${convId}`]: Date.now() });
  await kv.hdel(keys.userConvs(userId), convId);
}

/** Reset the viewer's unread counter for one conversation. */
export async function markRead(userId: string, peerId: string): Promise<void> {
  const kv = db();
  const convId = convIdFor(userId, peerId);
  const raw = (await kv.hgetall(keys.userConvs(userId))) ?? {};
  if (!raw[convId]) return;
  try {
    const summary = JSON.parse(raw[convId]) as ConvSummary;
    if (summary.unread) {
      summary.unread = 0;
      await kv.hset(keys.userConvs(userId), {
        [convId]: JSON.stringify(summary),
      });
    }
  } catch {
    // corrupted summary — leave as is
  }
}

export async function sendMessage(
  from: string,
  to: string,
  text: string,
  attach?: ChatMessage["attach"]
): Promise<ChatMessage> {
  const kv = db();
  const convId = convIdFor(from, to);
  const message: ChatMessage = {
    id: randomUUID().replace(/-/g, "").slice(0, 12),
    from,
    text,
    ts: Date.now(),
    ...(attach ? { attach } : {}),
  };
  await kv.zadd(keys.convMessages(convId), message.ts, JSON.stringify(message));

  const [fromProfile, toProfile] = await Promise.all([
    profileOf(from),
    profileOf(to),
  ]);
  const preview = (
    text
  ).slice(0, 120);

  // sender's summary (unread stays 0)
  await kv.hset(keys.userConvs(from), {
    [convId]: JSON.stringify({
      peerId: to,
      peerName: toProfile.name,
      lastText: preview,
      lastFrom: from,
      ts: message.ts,
      unread: 0,
    } satisfies ConvSummary),
  });

  // recipient's summary (bump unread)
  let unread = 1;
  const existing = (await kv.hgetall(keys.userConvs(to))) ?? {};
  if (existing[convId]) {
    try {
      unread = ((JSON.parse(existing[convId]) as ConvSummary).unread || 0) + 1;
    } catch {
      // corrupted — restart at 1
    }
  }
  await kv.hset(keys.userConvs(to), {
    [convId]: JSON.stringify({
      peerId: from,
      peerName: fromProfile.name,
      lastText: preview,
      lastFrom: from,
      ts: message.ts,
      unread,
    } satisfies ConvSummary),
  });

  // best-effort push to the recipient
  await sendPushToUser(to, {
    title: fromProfile.name,
    body: preview,
    url: `/menu/messages/${from}`,
    tag: `dm-${convId}`,
  });

  return message;
}
