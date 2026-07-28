import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { buildSummary, isTrusted } from "@/lib/admin";

export const dynamic = "force-dynamic";

/**
 * The dashboard's data. The owner and anyone the owner trusts; everyone else
 * gets a flat 404.
 *
 * The effective identity, not the real one: while the owner is standing in
 * somebody else's account they are seeing the app as that person sees it, and
 * that person cannot open this.
 */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!(await isTrusted(userId))) {
    // 404 rather than 403: no reason to confirm the endpoint exists
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(await buildSummary(userId!));
}
