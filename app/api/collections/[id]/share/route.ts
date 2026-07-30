import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDisplayName, getUserId, nameNotAddress } from "@/lib/auth";
import { parseBmKey } from "@/lib/bookmarkKey";
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
  const verses: {
    b: number;
    c: number;
    v: number;
    end?: number;
    label?: string;
    o?: number;
  }[] = [];
  for (const [key, raw] of Object.entries(bookmarks)) {
    try {
      const entry = JSON.parse(raw) as {
        t: number;
        l?: string;
        c?: string;
        o?: number;
      };
      if (entry.c !== id) continue;
      const ref = parseBmKey(key);
      if (!ref) continue;
      verses.push({
        b: ref.b,
        c: ref.c,
        v: ref.v,
        ...(ref.end > ref.v ? { end: ref.end } : {}),
        label: entry.l,
        ...(Number.isFinite(entry.o) ? { o: entry.o } : {}),
      });
    } catch {
      // legacy entry — never in a collection
    }
  }
  // a collection put in an order by hand is shared in that order; one that was
  // never touched keeps the canonical one
  verses.sort(
    (a, b) =>
      (a.o ?? Infinity) - (b.o ?? Infinity) ||
      a.b - b.b ||
      a.c - b.c ||
      a.v - b.v
  );

  // Belt and braces at the boundary. getDisplayName no longer hands back a
  // raw address, but this snapshot is served to anyone holding the token with
  // no account at all — so the guarantee is restated where it is relied on,
  // rather than trusted to hold three files away.
  const sharedBy = nameNotAddress(await getDisplayName(req));
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
