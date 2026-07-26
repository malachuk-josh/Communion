import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";

// Lightweight pending-count for the nav badge: unread direct messages. The
// notification feed it also used to count was removed — with nothing to open,
// the count had no way back down.

export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const kv = db();
  const convsRaw = await kv.hgetall(keys.userConvs(userId));

  let messages = 0;
  for (const raw of Object.values(convsRaw ?? {})) {
    try {
      messages += (JSON.parse(raw) as { unread?: number }).unread || 0;
    } catch {
      // corrupted summary — skip
    }
  }

  return NextResponse.json({ messages });
}
