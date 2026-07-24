import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getBook } from "@/lib/bible";
import { db, keys } from "@/lib/db";

// Verse bookmarks: a per-user hash of "book:chapter:verse" → saved-at
// timestamp. Toggled from Study Mode; listed newest-first for quick jumps.

const MAX_BOOKMARKS = 200;

export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const bookmarks = (await db().hgetall(keys.userBookmarks(userId))) ?? {};
  const parsed: Record<string, number> = {};
  for (const [key, ts] of Object.entries(bookmarks)) parsed[key] = Number(ts);
  return NextResponse.json({ bookmarks: parsed });
}

/** Toggle one bookmark. */
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    b?: number;
    c?: number;
    v?: number;
  } | null;
  const book = body?.b !== undefined ? getBook(body.b) : undefined;
  if (
    !book ||
    !body?.c ||
    !body?.v ||
    body.c < 1 ||
    body.c > book.chapters ||
    body.v < 1 ||
    body.v > 200
  ) {
    return NextResponse.json({ error: "Invalid verse" }, { status: 400 });
  }

  const kv = db();
  const key = `${body.b}:${body.c}:${body.v}`;
  const existing = (await kv.hgetall(keys.userBookmarks(userId))) ?? {};
  if (key in existing) {
    await kv.hdel(keys.userBookmarks(userId), key);
    return NextResponse.json({ bookmarked: false });
  }
  if (Object.keys(existing).length >= MAX_BOOKMARKS) {
    // drop the oldest to make room
    const oldest = Object.entries(existing).sort(
      (a, b) => Number(a[1]) - Number(b[1])
    )[0];
    if (oldest) await kv.hdel(keys.userBookmarks(userId), oldest[0]);
  }
  await kv.hset(keys.userBookmarks(userId), { [key]: Date.now() });
  return NextResponse.json({ bookmarked: true });
}
