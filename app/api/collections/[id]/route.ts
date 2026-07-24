import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";

/** Rename a collection. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  const name = body?.name?.trim().slice(0, 80);
  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  const kv = db();
  const existing = (await kv.hgetall(keys.userCollections(userId))) ?? {};
  if (!(id in existing)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const entry = JSON.parse(existing[id]) as { name: string; share?: string };
  entry.name = name;
  await kv.hset(keys.userCollections(userId), { [id]: JSON.stringify(entry) });
  return NextResponse.json({ ok: true });
}

/** Delete a collection; its bookmarks fall back to Unsorted. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const kv = db();
  const existing = (await kv.hgetall(keys.userCollections(userId))) ?? {};
  if (!(id in existing)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await kv.hdel(keys.userCollections(userId), id);
  // detach bookmarks
  const bookmarks = (await kv.hgetall(keys.userBookmarks(userId))) ?? {};
  for (const [key, raw] of Object.entries(bookmarks)) {
    try {
      const entry = JSON.parse(raw) as { c?: string };
      if (entry.c === id) {
        delete entry.c;
        await kv.hset(keys.userBookmarks(userId), {
          [key]: JSON.stringify(entry),
        });
      }
    } catch {
      // legacy plain timestamp — nothing to detach
    }
  }
  return NextResponse.json({ ok: true });
}
