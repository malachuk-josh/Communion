import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";
import { NOTIF_TTL_MS } from "@/lib/push";

/**
 * The user's notifications from the last day, newest first.
 *
 * The window is applied here as well as at the write, and deliberately so:
 * pruning happens when a notification is sent, so somebody who has had none
 * since yesterday would otherwise still be shown yesterday's until the next
 * one arrives to clear them out. Reading by score means the answer is right
 * whether or not anything has been written since.
 */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const since = Date.now() - NOTIF_TTL_MS;
  const raw = await db().zrangebyscore(
    keys.userNotifs(userId),
    since,
    Number.MAX_SAFE_INTEGER
  );
  const notifications: {
    title: string;
    body: string;
    url?: string;
    ts: number;
  }[] = [];
  for (const item of raw) {
    try {
      const entry = JSON.parse(item) as {
        title: string;
        body: string;
        url?: string;
        ts: number;
      };
      // the score is the timestamp, but the entry carries its own; trust the
      // one being displayed rather than assuming they agree
      if (entry.ts >= since) notifications.push(entry);
    } catch {
      // corrupted entry — skip
    }
  }
  notifications.sort((a, b) => b.ts - a.ts);
  return NextResponse.json({ notifications });
}
