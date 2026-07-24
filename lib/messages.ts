// Direct messages between believers who share a Church. Conversations are
// unordered user pairs; messages live in a zset scored by timestamp, and
// each participant keeps a per-conversation summary (peer, last message,
// unread count) for the inbox list.

import { randomUUID } from "crypto";
import { db, keys } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  ts: number;
  /** shared verse card: a bookmark, note, or word translation */
  attach?: {
    b: number;
    c: number;
    v: number;
    kind: "bookmark" | "note" | "word";
    label?: string;
  };
}

export interface ConvSummary {
  peerId: string;
  peerName: string;
  peerIcon?: string;
  lastText: string;
  lastFrom: string;
  ts: number;
  unread: number;
}

export interface Contact {
  userId: string;
  displayName: string;
  icon?: string;
}

export function convIdFor(a: string, b: string): string {
  return [a, b].sort().join("~");
}

async function profileOf(
  userId: string
): Promise<{ name: string; icon?: string }> {
  const profile = await db().hgetall(keys.user(userId));
  return {
    name: profile?.displayName || "Believer",
    icon: profile?.icon || undefined,
  };
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
      seen.set(memberId, {
        userId: memberId,
        displayName: p.name,
        icon: p.icon,
      });
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );
}

export async function sharesChurch(a: string, b: string): Promise<boolean> {
  const kv = db();
  const [mine, theirs] = await Promise.all([
    kv.smembers(keys.userChurches(a)),
    kv.smembers(keys.userChurches(b)),
  ]);
  const theirSet = new Set(theirs);
  return mine.some((id) => theirSet.has(id));
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

export async function getThread(
  userId: string,
  peerId: string,
  since = 0
): Promise<ChatMessage[]> {
  const kv = db();
  const convId = convIdFor(userId, peerId);
  const raw = await kv.zrangebyscore(
    keys.convMessages(convId),
    since,
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
    attach ? `📖 ${text}`.trim() : text
  ).slice(0, 120);

  // sender's summary (unread stays 0)
  await kv.hset(keys.userConvs(from), {
    [convId]: JSON.stringify({
      peerId: to,
      peerName: toProfile.name,
      peerIcon: toProfile.icon,
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
      peerIcon: fromProfile.icon,
      lastText: preview,
      lastFrom: from,
      ts: message.ts,
      unread,
    } satisfies ConvSummary),
  });

  // best-effort push to the recipient
  await sendPushToUser(to, {
    title: `${fromProfile.icon ? `${fromProfile.icon} ` : "💬 "}${fromProfile.name}`,
    body: preview,
    url: `/menu/messages/${from}`,
    tag: `dm-${convId}`,
  });

  return message;
}
