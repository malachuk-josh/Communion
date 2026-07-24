import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";

/** The user's notification history, newest first. */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const raw = await db().zrangebyscore(
    keys.userNotifs(userId),
    0,
    Number.MAX_SAFE_INTEGER
  );
  const notifications = [];
  for (const item of raw) {
    try {
      notifications.push(
        JSON.parse(item) as {
          title: string;
          body: string;
          url?: string;
          ts: number;
        }
      );
    } catch {
      // corrupted entry — skip
    }
  }
  notifications.sort((a, b) => b.ts - a.ts);
  return NextResponse.json({ notifications: notifications.slice(0, 50) });
}
