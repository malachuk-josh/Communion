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
 * A day. These are things that have already happened — a session starting, a
 * request to join, a message that by then has been read — and a feed of them
 * going back weeks is a list nobody scrolls. What it is for is the hour after
 * a phone was face-down on a table: what did I miss?
 */
export const NOTIF_TTL_MS = 24 * 60 * 60 * 1000;

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
