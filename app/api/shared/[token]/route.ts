import { NextResponse } from "next/server";
import { db, keys } from "@/lib/db";

/** Public read of a shared collection snapshot — no auth required. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!/^[a-f0-9]{16}$/.test(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const raw = await db().hgetall(keys.sharedCollection(token));
  if (!raw?.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(JSON.parse(raw.data));
}
