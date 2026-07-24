import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDisplayName, getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";

// Publish (or refresh) a public snapshot of a collection. The share token
// is stable per collection, so re-sharing updates the same link with the
// collection's current verses and labels.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const kv = db();
  const collections = (await kv.hgetall(keys.userCollections(userId))) ?? {};
  if (!(id in collections)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const coll = JSON.parse(collections[id]) as { name: string; share?: string };
  const token = coll.share ?? randomUUID().replace(/-/g, "").slice(0, 16);

  const bookmarks = (await kv.hgetall(keys.userBookmarks(userId))) ?? {};
  const verses: { b: number; c: number; v: number; label?: string }[] = [];
  for (const [key, raw] of Object.entries(bookmarks)) {
    try {
      const entry = JSON.parse(raw) as { t: number; l?: string; c?: string };
      if (entry.c !== id) continue;
      const [b, c, v] = key.split(":").map(Number);
      verses.push({ b, c, v, label: entry.l });
    } catch {
      // legacy entry — never in a collection
    }
  }
  verses.sort((a, b) => a.b - b.b || a.c - b.c || a.v - b.v);

  const sharedBy = await getDisplayName(req);
  await kv.hset(keys.sharedCollection(token), {
    data: JSON.stringify({
      name: coll.name,
      sharedBy,
      verses,
      updatedAt: Date.now(),
    }),
  });
  if (!coll.share) {
    coll.share = token;
    await kv.hset(keys.userCollections(userId), {
      [id]: JSON.stringify(coll),
    });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  return NextResponse.json({
    url: `${origin}/shared/${token}`,
    count: verses.length,
  });
}
