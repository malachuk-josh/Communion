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

/**
 * The five ways to answer a message without writing one.
 *
 * One per person per message, and choosing another replaces it — the same
 * bargain every messaging app makes with these, and the reason they read as
 * an answer rather than as a tally. Tapping the one you already gave takes
 * it back.
 */
export const REACTIONS = ["like", "heart", "question", "emphasize", "laugh"] as const;
export type ReactionKind = (typeof REACTIONS)[number];

export function isReaction(kind: unknown): kind is ReactionKind {
  return REACTIONS.includes(kind as ReactionKind);
}

/** What a message has collected: how many of each, and which one is mine. */
export interface Reactions {
  counts: Partial<Record<ReactionKind, number>>;
  mine?: ReactionKind;
}

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  ts: number;
  /** a shared card: a verse you kept, a note on one, a word, or a collection */
  attach?: Attachment;
  /** absent when nobody has reacted, which is almost every message */
  reactions?: Reactions;
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

/*
 * Where the unread count lives: beside the summary, not inside it.
 *
 * The summary is one JSON string in one hash field, so touching any part of
 * it means writing all of it — and this store has no transaction to make that
 * safe. Opening a thread and receiving a message are the two things most
 * likely to happen at the same instant, and when they did, the reader's
 * "unread = 0" was written from a copy fetched before the message landed: the
 * new message's preview and timestamp were overwritten with the old ones, the
 * conversation sank back down the inbox, and the count it had just been
 * cleared to zero hid that anything had arrived at all. The message itself was
 * always safe in the thread — but the inbox is how you learn to go and look.
 *
 * Splitting the count out means marking a thread read is a write to a field
 * nobody else writes for that reason, so it cannot clobber a preview. A send
 * and a read racing can still cost one tick of the badge, which is the same
 * imprecision the increment already had, and costs nothing but a number.
 *
 * `#` cannot occur in a conversation id — those are two user ids joined by
 * `~` — so the two namespaces cannot collide.
 */
const unreadField = (convId: string) => `${convId}#unread`;

/** Older summaries carried the count inside the blob; read through to it once. */
function unreadOf(raw: Record<string, string>, convId: string): number {
  const beside = raw[unreadField(convId)];
  if (beside !== undefined) return Number(beside) || 0;
  try {
    return (JSON.parse(raw[convId] ?? "{}") as ConvSummary).unread || 0;
  } catch {
    return 0;
  }
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
  for (const [field, value] of Object.entries(raw)) {
    if (field.includes("#")) continue; // an unread counter, joined on below
    try {
      const summary = JSON.parse(value) as ConvSummary;
      summary.unread = unreadOf(raw, field);
      convs.push(summary);
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

/**
 * A thread as the client needs it: the messages asked for, and every reaction
 * in the conversation.
 *
 * The two have different spans on purpose. Messages are trimmed by `since`,
 * because polling a long conversation every four seconds to re-send what the
 * screen already has is waste. Reactions are not, because a reaction is a
 * change to a message that is already on screen — usually an old one — and
 * trimming them by the same clock is precisely why they never arrived: the
 * poll asked only for what was new, a reaction made a message no newer, and
 * so the answer somebody left was invisible on the other phone until a reload.
 * Sending the whole map costs one hash read that this function already makes.
 */
export interface Thread {
  messages: ChatMessage[];
  reactions: Record<string, Reactions>;
}

export async function getThread(
  userId: string,
  peerId: string,
  since = 0
): Promise<Thread> {
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

  /*
   * Reactions, in one read for the whole conversation.
   *
   * They cannot live on the message: a message is a JSON string inside a
   * zset, so changing one means removing the exact old string and adding a
   * new one — a race with anything else writing to the thread, over a value
   * that has to match character for character. They are kept beside it
   * instead, and joined here.
   */
  const raw2 = (await kv.hgetall(keys.convReactions(convId))) ?? {};
  const byMessage = new Map<string, Reactions>();
  for (const [field, kind] of Object.entries(raw2)) {
    if (!isReaction(kind)) continue;
    const at = field.indexOf(":");
    if (at <= 0) continue;
    const messageId = field.slice(0, at);
    const who = field.slice(at + 1);
    const held = byMessage.get(messageId) ?? { counts: {} };
    held.counts[kind] = (held.counts[kind] ?? 0) + 1;
    if (who === userId) held.mine = kind;
    byMessage.set(messageId, held);
  }
  for (const message of messages) {
    const found = byMessage.get(message.id);
    if (found) message.reactions = found;
  }

  return {
    messages: messages.sort((a, b) => a.ts - b.ts),
    reactions: Object.fromEntries(byMessage),
  };
}

/**
 * Answer a message, or take the answer back.
 *
 * `kind` of null clears whatever this reader left. Anything else replaces it,
 * so nobody accumulates five reactions on one message — the point of these is
 * that they are a single gesture.
 *
 * The message has to exist in this conversation. Without that check the hash
 * would take a field for any id at all, which is a way to write into somebody
 * else's conversation without saying anything they could see.
 */
export async function react(
  userId: string,
  peerId: string,
  messageId: string,
  kind: ReactionKind | null
): Promise<boolean> {
  const kv = db();
  const convId = convIdFor(userId, peerId);
  const raw = await kv.zrangebyscore(
    keys.convMessages(convId),
    0,
    Number.MAX_SAFE_INTEGER
  );
  const exists = raw.some((item) => {
    try {
      return (JSON.parse(item) as ChatMessage).id === messageId;
    } catch {
      return false;
    }
  });
  if (!exists) return false;

  const field = `${messageId}:${userId}`;
  if (kind === null) await kv.hdel(keys.convReactions(convId), field);
  else await kv.hset(keys.convReactions(convId), { [field]: kind });
  return true;
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

      // the answers people left on it go with it, or they would sit in the
      // hash forever counting toward a message nobody can see
      const reactions = (await kv.hgetall(keys.convReactions(convId))) ?? {};
      for (const field of Object.keys(reactions)) {
        if (field.startsWith(`${messageId}:`)) {
          await kv.hdel(keys.convReactions(convId), field);
        }
      }

      /*
       * Keep both inboxes honest about what the last message now is — but
       * from a list read after the removal, not the one this loop is walking.
       * That snapshot was taken before the delete, so anything that arrived
       * in between is missing from it, and rebuilding the summary from it
       * would quietly rewind both inboxes past a message that had just come
       * in. Deleting your own message must not un-deliver somebody else's.
       */
      const after = (
        await kv.zrangebyscore(
          keys.convMessages(convId),
          0,
          Number.MAX_SAFE_INTEGER
        )
      )
        .map((r) => {
          try {
            return JSON.parse(r) as ChatMessage;
          } catch {
            return null;
          }
        })
        .filter((m): m is ChatMessage => m !== null)
        .sort((a, b) => a.ts - b.ts);
      for (const side of [userId, peerId]) {
        const summaries = (await kv.hgetall(keys.userConvs(side))) ?? {};
        if (!summaries[convId]) continue;
        try {
          const summary = JSON.parse(summaries[convId]) as ConvSummary;
          // already showing something newer than what was deleted: the
          // summary is right and this delete has nothing to say about it
          if (summary.ts > message.ts) continue;
          /*
           * Each side's own floor. Clearing a conversation does not delete
           * the messages — it records the moment it was cleared, and the
           * thread hides everything at or before it. Rebuilding the preview
           * from every message in the zset ignored that, so when the other
           * person deleted something, a conversation somebody had cleared
           * came back into their inbox quoting a line from before they
           * cleared it. What one side hid, the other side's delete undid.
           */
          const floor = await clearedAt(side, convId);
          const visible = floor ? after.filter((m) => m.ts > floor) : after;
          const last = visible[visible.length - 1];
          if (!last && floor) {
            // they cleared this, and the one message that had brought it back
            // is the message just deleted: hidden again, as it was
            await kv.hdel(keys.userConvs(side), convId);
            await kv.hdel(keys.userConvs(side), unreadField(convId));
            continue;
          }
          if (last) {
            summary.lastText = last.text;
            summary.lastFrom = last.from;
            summary.ts = last.ts;
          } else {
            summary.lastText = "";
          }
          summary.unread = unreadOf(summaries, convId);
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
  await kv.hdel(keys.userConvs(userId), unreadField(convId));
}

/**
 * Reset the viewer's unread counter for one conversation.
 *
 * One field, written blind. The read that follows is only to avoid leaving a
 * counter behind for a conversation that does not exist — it is not part of
 * the write, so there is no window between them to lose anything in.
 */
export async function markRead(userId: string, peerId: string): Promise<void> {
  const kv = db();
  const convId = convIdFor(userId, peerId);
  const raw = (await kv.hgetall(keys.userConvs(userId))) ?? {};
  if (!raw[convId]) return;
  await kv.hset(keys.userConvs(userId), { [unreadField(convId)]: "0" });
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

  // sender's summary (writing to somebody is reading the thread)
  await kv.hset(keys.userConvs(from), {
    [convId]: JSON.stringify({
      peerId: to,
      peerName: toProfile.name,
      lastText: preview,
      lastFrom: from,
      ts: message.ts,
      unread: 0,
    } satisfies ConvSummary),
    [unreadField(convId)]: "0",
  });

  // recipient's summary (bump unread)
  const existing = (await kv.hgetall(keys.userConvs(to))) ?? {};
  const unread = (existing[convId] ? unreadOf(existing, convId) : 0) + 1;
  await kv.hset(keys.userConvs(to), {
    [convId]: JSON.stringify({
      peerId: from,
      peerName: fromProfile.name,
      lastText: preview,
      lastFrom: from,
      ts: message.ts,
      unread,
    } satisfies ConvSummary),
    [unreadField(convId)]: String(unread),
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
