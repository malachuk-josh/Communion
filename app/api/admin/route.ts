import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { buildSummary, isOwner } from "@/lib/admin";

export const dynamic = "force-dynamic";

/** Owner-only overview of the whole app. Everyone else gets a flat 404. */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!isOwner(userId)) {
    // 404 rather than 403: no reason to confirm the endpoint exists
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(await buildSummary());
}
