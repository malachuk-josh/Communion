import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";

// Where a reader is in each Bookshelf book, kept on their account so it
// follows them from the phone to the tablet. One small hash per reader, a
// field per book; the device keeps its own copy too, and whichever is newer
// wins (lib/bookshelf.ts).

/** A book's slug and a part's id: what the files are named, and nothing else. */
const SLUG = /^[a-z0-9-]{1,60}$/;
const PART = /^[a-z0-9-]{1,30}$/;

export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const book = new URL(req.url).searchParams.get("book") ?? "";
  if (!SLUG.test(book)) {
    return NextResponse.json({ error: "book required" }, { status: 400 });
  }
  const raw = ((await db().hgetall(keys.userBookPlaces(userId))) ?? {})[book];
  let place = null;
  try {
    place = raw ? JSON.parse(raw) : null;
  } catch {
    // a damaged entry reads as no place, and the next save replaces it
  }
  return NextResponse.json({ place });
}

export async function PUT(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    book?: string;
    part?: string;
    at?: number;
    ts?: number;
  } | null;
  const at = Number(body?.at);
  const ts = Number(body?.ts);
  if (
    !body ||
    !SLUG.test(body.book ?? "") ||
    !PART.test(body.part ?? "") ||
    !Number.isFinite(at) ||
    !Number.isFinite(ts)
  ) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const kv = db();
  const key = keys.userBookPlaces(userId);
  // an older save arriving late — a phone that was offline — must not move
  // the reader back from where another device has since taken them
  const current = ((await kv.hgetall(key)) ?? {})[body.book!];
  try {
    if (current && Number(JSON.parse(current).ts) > ts) {
      return NextResponse.json({ ok: true, kept: "newer" });
    }
  } catch {
    // a damaged entry is simply replaced
  }
  // a clock far in the future would pin the place for good
  const stamp = Math.min(ts, Date.now() + 60_000);
  await kv.hset(key, {
    [body.book!]: JSON.stringify({
      part: body.part,
      at: Math.min(1, Math.max(0, at)),
      ts: stamp,
    }),
  });
  return NextResponse.json({ ok: true });
}
