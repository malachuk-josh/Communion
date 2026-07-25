// Discussion threads inside a Fellowship: a titled topic with replies.
// Posts may carry a scripture reference or a shared bookmark/note/word
// study, using the same attachment shape as direct messages.

import { randomUUID } from "crypto";
import { getBook } from "@/lib/bible";
import { db, keys } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";

export interface PostAttach {
  b: number;
  c: number;
  v?: number;
  kind: "verse" | "bookmark" | "note" | "word";
  label?: string;
}

export interface ThreadPost {
  id: string;
  from: string;
  fromName: string;
  fromIcon?: string;
  text: string;
  ts: number;
  attach?: PostAttach;
}

export interface ThreadSummary {
  id: string;
  churchId: string;
  title: string;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  lastAt: number;
  replies: number;
  lastText: string;
}

const KINDS = ["verse", "bookmark", "note", "word"];

/** Validate a client-supplied attachment: null when absent, "invalid" when bad. */
export function validateAttach(raw: unknown): PostAttach | null | "invalid" {
  if (!raw) return null;
  const a = raw as Partial<PostAttach>;
  const book = a.b !== undefined ? getBook(Number(a.b)) : undefined;
  if (
    !book ||
    !a.c ||
    Number(a.c) < 1 ||
    Number(a.c) > book.chapters ||
    (a.v !== undefined && (Number(a.v) < 1 || Number(a.v) > 200)) ||
    !a.kind ||
    !KINDS.includes(a.kind)
  ) {
    return "invalid";
  }
  return {
    b: Number(a.b),
    c: Number(a.c),
    ...(a.v ? { v: Number(a.v) } : {}),
    kind: a.kind,
    label: a.label?.trim().slice(0, 1000) || undefined,
  };
}

async function profileOf(userId: string) {
  const profile = await db().hgetall(keys.user(userId));
  return {
    name: profile?.displayName || "Believer",
    icon: profile?.icon || undefined,
  };
}

export async function listThreads(churchId: string): Promise<ThreadSummary[]> {
  const kv = db();
  const ids = await kv.zrangebyscore(
    keys.churchThreads(churchId),
    0,
    Number.MAX_SAFE_INTEGER
  );
  const threads = await Promise.all(
    ids.map(async (id) => {
      const raw = await kv.hgetall(keys.thread(id));
      if (!raw?.title) return null;
      return {
        id,
        churchId: raw.churchId ?? churchId,
        title: raw.title,
        createdBy: raw.createdBy ?? "",
        createdByName: raw.createdByName || "Believer",
        createdAt: Number(raw.createdAt) || 0,
        lastAt: Number(raw.lastAt) || 0,
        replies: Number(raw.replies) || 0,
        lastText: raw.lastText ?? "",
      } satisfies ThreadSummary;
    })
  );
  return threads
    .filter((t): t is ThreadSummary => t !== null)
    .sort((a, b) => b.lastAt - a.lastAt);
}

export async function getThreadMeta(
  threadId: string
): Promise<ThreadSummary | null> {
  const raw = await db().hgetall(keys.thread(threadId));
  if (!raw?.title) return null;
  return {
    id: threadId,
    churchId: raw.churchId ?? "",
    title: raw.title,
    createdBy: raw.createdBy ?? "",
    createdByName: raw.createdByName || "Believer",
    createdAt: Number(raw.createdAt) || 0,
    lastAt: Number(raw.lastAt) || 0,
    replies: Number(raw.replies) || 0,
    lastText: raw.lastText ?? "",
  };
}

export async function getPosts(threadId: string): Promise<ThreadPost[]> {
  const raw = await db().zrangebyscore(
    keys.threadPosts(threadId),
    0,
    Number.MAX_SAFE_INTEGER
  );
  const posts: ThreadPost[] = [];
  for (const item of raw) {
    try {
      posts.push(JSON.parse(item) as ThreadPost);
    } catch {
      // corrupted post — skip
    }
  }
  return posts.sort((a, b) => a.ts - b.ts);
}

/** Push to every member of the Fellowship except the author. */
async function notifyMembers(
  churchId: string,
  authorId: string,
  title: string,
  body: string,
  url: string,
  tag: string
): Promise<void> {
  const members = (await db().hgetall(keys.churchMembers(churchId))) ?? {};
  for (const memberId of Object.keys(members)) {
    if (memberId === authorId) continue;
    await sendPushToUser(memberId, { title, body, url, tag }).catch(() => {});
  }
}

export async function createThread(
  churchId: string,
  churchName: string,
  userId: string,
  title: string,
  text: string,
  attach?: PostAttach
): Promise<ThreadSummary> {
  const kv = db();
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  const now = Date.now();
  const author = await profileOf(userId);

  await kv.hset(keys.thread(id), {
    churchId,
    title,
    createdBy: userId,
    createdByName: author.name,
    createdAt: now,
    lastAt: now,
    replies: 0,
    lastText: text.slice(0, 120),
  });
  await kv.zadd(keys.churchThreads(churchId), now, id);

  if (text || attach) {
    const post: ThreadPost = {
      id: randomUUID().replace(/-/g, "").slice(0, 12),
      from: userId,
      fromName: author.name,
      fromIcon: author.icon,
      text,
      ts: now,
      ...(attach ? { attach } : {}),
    };
    await kv.zadd(keys.threadPosts(id), now, JSON.stringify(post));
  }

  await notifyMembers(
    churchId,
    userId,
    `💬 ${churchName}`,
    `${author.name} started "${title}"`,
    `/churches/${churchId}/threads/${id}`,
    `thread-${id}`
  );

  return {
    id,
    churchId,
    title,
    createdBy: userId,
    createdByName: author.name,
    createdAt: now,
    lastAt: now,
    replies: 0,
    lastText: text.slice(0, 120),
  };
}

export async function addPost(
  threadId: string,
  churchId: string,
  churchName: string,
  userId: string,
  text: string,
  attach?: PostAttach
): Promise<ThreadPost> {
  const kv = db();
  const now = Date.now();
  const author = await profileOf(userId);
  const post: ThreadPost = {
    id: randomUUID().replace(/-/g, "").slice(0, 12),
    from: userId,
    fromName: author.name,
    fromIcon: author.icon,
    text,
    ts: now,
    ...(attach ? { attach } : {}),
  };
  await kv.zadd(keys.threadPosts(threadId), now, JSON.stringify(post));

  const meta = await kv.hgetall(keys.thread(threadId));
  await kv.hset(keys.thread(threadId), {
    lastAt: now,
    replies: (Number(meta?.replies) || 0) + 1,
    lastText: text.slice(0, 120),
  });
  await kv.zadd(keys.churchThreads(churchId), now, threadId);

  await notifyMembers(
    churchId,
    userId,
    `💬 ${meta?.title ?? churchName}`,
    `${author.name}: ${text.slice(0, 90)}`,
    `/churches/${churchId}/threads/${threadId}`,
    `thread-${threadId}`
  );

  return post;
}
