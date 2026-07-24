import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";

// Lightweight pending-count for the nav badge: unread direct messages plus
// notifications newer than the user's last look at the Notifications view.
// Message notifications (tag "dm-…") are excluded from the second count so
// one incoming message never counts twice.

export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const kv = db();
  const [convsRaw, profile, notifsRaw] = await Promise.all([
    kv.hgetall(keys.userConvs(userId)),
    kv.hgetall(keys.user(userId)),
    kv.zrangebyscore(keys.userNotifs(userId), 0, Number.MAX_SAFE_INTEGER),
  ]);

  let messages = 0;
  for (const raw of Object.values(convsRaw ?? {})) {
    try {
      messages += (JSON.parse(raw) as { unread?: number }).unread || 0;
    } catch {
      // corrupted summary — skip
    }
  }

  const seenAt = Number(profile?.notifSeenAt) || 0;
  let notifications = 0;
  for (const item of notifsRaw) {
    try {
      const n = JSON.parse(item) as { ts: number; tag?: string };
      if (n.ts > seenAt && !n.tag?.startsWith("dm-")) notifications++;
    } catch {
      // corrupted entry — skip
    }
  }

  return NextResponse.json({ messages, notifications, total: messages + notifications });
}
