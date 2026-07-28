import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { getDisplayName, getUserId } from "@/lib/auth";
import { createChurch, listUserChurches, saveProfile } from "@/lib/churches";
import { db, keys } from "@/lib/db";

export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const churches = await listUserChurches(userId);
  return NextResponse.json({ churches });
}

/**
 * How many Gatherings one person may start in half a day, and how long that
 * half day is.
 *
 * Five is far past what anyone founding something real will reach — a person
 * gathers a group, they do not mint groups — so the only account that ever
 * meets this is one making them faster than they can be meant.
 *
 * Deliberately unannounced. No counter, no "2 of 5 remaining", nothing on the
 * form: telling everybody about a ceiling none of them will touch teaches
 * ordinary people to think of the app as rationed, and tells the one person
 * who is flooding it exactly what shape the wall is. It is said once, to the
 * person refused, at the moment they are refused.
 */
const GATHERING_LIMIT = 5;
const GATHERING_WINDOW_MS = 12 * 60 * 60 * 1000;

/** "3 hours", "40 minutes" — long enough to be a real answer, not a countdown. */
function untilNext(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hours`;
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    description?: string;
    displayName?: string;
  } | null;

  const name = body?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Counted after the form is valid, so a mistyped submission never spends
  // one of the five.
  const kv = db();
  const rateKey = keys.churchRate(userId);
  const now = Date.now();
  const since = now - GATHERING_WINDOW_MS;
  // The timestamp is carried in the member, not just the score, because
  // reading a score back is not part of the store's contract — and the wait
  // has to be a real number of hours rather than a shrug.
  const recent = await kv.zrangebyscore(rateKey, since, now);
  if (recent.length >= GATHERING_LIMIT) {
    const oldest = Number(recent[0]?.split(".")[0]) || since;
    return NextResponse.json(
      {
        error:
          `You've started ${GATHERING_LIMIT} Gatherings in the last 12 hours. ` +
          `You can start another in about ${untilNext(oldest + GATHERING_WINDOW_MS - now)}.`,
      },
      { status: 429 }
    );
  }
  // Anything older than the window is answering no question; drop it rather
  // than let the key grow for the life of the account.
  for (const stale of await kv.zrangebyscore(rateKey, 0, since - 1)) {
    await kv.zrem(rateKey, stale);
  }

  const displayName = await getDisplayName(req, body?.displayName);
  await saveProfile(userId, displayName);
  const church = await createChurch(userId, name, body?.description?.trim() ?? "");

  await kv.zadd(rateKey, now, `${now}.${nanoid(6)}`);
  await kv.expire(rateKey, Math.ceil(GATHERING_WINDOW_MS / 1000));

  return NextResponse.json({ church }, { status: 201 });
}
