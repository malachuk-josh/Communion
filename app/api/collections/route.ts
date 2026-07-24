import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";

const MAX_COLLECTIONS = 40;

/** Create a named bookmark collection. */
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  const name = body?.name?.trim().slice(0, 80);
  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  const kv = db();
  const existing = (await kv.hgetall(keys.userCollections(userId))) ?? {};
  if (Object.keys(existing).length >= MAX_COLLECTIONS) {
    return NextResponse.json({ error: "Too many collections" }, { status: 400 });
  }
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  await kv.hset(keys.userCollections(userId), {
    [id]: JSON.stringify({ name }),
  });
  return NextResponse.json({ id, name }, { status: 201 });
}
