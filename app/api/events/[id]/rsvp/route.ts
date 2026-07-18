import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { setRsvp } from "@/lib/churches";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    status?: string;
  } | null;
  const status = body?.status;
  if (status !== "going" && status !== "maybe" && status !== "no") {
    return NextResponse.json({ error: "Invalid RSVP" }, { status: 400 });
  }
  const result = await setRsvp(id, userId, status);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
