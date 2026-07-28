// Web push notifications. Dormant until VAPID keys are configured
// (NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY) — same graceful
// fallback pattern as Clerk/Upstash/Brevo. Subscriptions are stored per
// user keyed by a hash of the endpoint so one user can have several
// devices; dead subscriptions (410/404) are pruned on send.

import { createHash } from "crypto";
import { db, keys } from "@/lib/db";

function cleanEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return undefined;
  const unquoted = firstLine.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  return unquoted || undefined;
}

export function pushEnabled(): boolean {
  return !!(
    cleanEnv(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) &&
    cleanEnv(process.env.VAPID_PRIVATE_KEY)
  );
}

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function endpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
}

export async function saveSubscription(
  userId: string,
  sub: PushSubscriptionJson
): Promise<void> {
  await db().hset(keys.userPushSubs(userId), {
    [endpointHash(sub.endpoint)]: JSON.stringify(sub),
  });
}

export async function removeSubscription(
  userId: string,
  endpoint: string
): Promise<void> {
  await db().hdel(keys.userPushSubs(userId), endpointHash(endpoint));
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * How long a notification is worth keeping.
 *
 * It was a day, on the reasoning that these are things which have already
 * happened and what the list is for is the hour after a phone was face-down
 * on a table: what did I miss? That was right about the common case and
 * wrong about the list. A month back is where you go to find the evening
 * somebody asked to join, or which Gathering that session belonged to — and
 * a screen that offers to show you more of a day has almost nothing to
 * offer.
 *
 * So: a month, and a ceiling. Five are shown at a time and the rest are a
 * tap away, which is what keeps a long list from being a list nobody
 * scrolls — the length, not the age, was the thing to fix.
 */
export const NOTIF_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * And no more than this many, however busy the month was.
 *
 * A cap as well as an age, because the two answer different questions: the
 * age says when a thing stops mattering, this says how much of anyone's
 * account we are willing to spend on remembering. Two hundred is far past
 * what anyone will scroll and far short of what would be a burden to hold.
 */
export const NOTIF_MAX = 200;

/** Keep an in-app history of every notification, delivered by push or not. */
async function logNotification(
  userId: string,
  payload: PushPayload
): Promise<void> {
  const kv = db();
  const key = keys.userNotifs(userId);
  const now = Date.now();
  await kv.zadd(key, now, JSON.stringify({ ...payload, ts: now }));

  // Drop what has aged out. Writing is the moment to do it: it is the only
  // moment the set is known to be growing, and it means a busy user's feed is
  // trimmed by their own traffic rather than by a reader waiting on a page.
  const stale = await kv.zrangebyscore(key, 0, now - NOTIF_TTL_MS);
  for (const item of stale) await kv.zrem(key, item);

  // Then the ceiling. zrangebyscore comes back oldest first, so anything past
  // the cap is at the front of it. Read from the window that survived the
  // sweep above rather than from the whole key, or the two would disagree
  // about what is still there.
  const living = await kv.zrangebyscore(
    key,
    now - NOTIF_TTL_MS,
    Number.MAX_SAFE_INTEGER
  );
  for (const item of living.slice(0, Math.max(0, living.length - NOTIF_MAX))) {
    await kv.zrem(key, item);
  }

  // And a TTL over the whole set, so somebody who stops getting notifications
  // altogether does not leave one behind for good. Refreshed on every write,
  // with an hour's grace so it never expires an entry still inside its day.
  await kv.expire(key, Math.ceil(NOTIF_TTL_MS / 1000) + 3600);
}

/** Send a payload to every device the user subscribed. Returns sends that succeeded. */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<number> {
  await logNotification(userId, payload).catch(() => {});
  const publicKey = cleanEnv(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const privateKey = cleanEnv(process.env.VAPID_PRIVATE_KEY);
  if (!publicKey || !privateKey) return 0;

  const kv = db();
  const subs = await kv.hgetall(keys.userPushSubs(userId));
  if (!subs) return 0;

  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(
    "https://communion-mu.vercel.app",
    publicKey,
    privateKey
  );

  let sent = 0;
  for (const [hash, raw] of Object.entries(subs)) {
    try {
      const sub = JSON.parse(raw) as PushSubscriptionJson;
      await webpush.sendNotification(sub, JSON.stringify(payload), {
        TTL: 24 * 60 * 60,
      });
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // subscription expired or revoked — prune it
        await kv.hdel(keys.userPushSubs(userId), hash);
      }
    }
  }
  return sent;
}
