import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { resolveRequest } from "@/lib/churches";

/** Founder approves or declines a join request. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; requesterId: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, requesterId } = await params;
  const body = (await req.json().catch(() => null)) as {
    action?: string;
  } | null;
  if (body?.action !== "approve" && body?.action !== "decline") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const resolved = await resolveRequest(
    id,
    userId,
    requesterId,
    body.action === "approve"
  );
  if (!resolved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
