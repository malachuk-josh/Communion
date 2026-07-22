import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { deleteEvent, updateEvent } from "@/lib/churches";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    type?: string;
    title?: string;
    startsAt?: number;
    durationMin?: number;
    passageRef?: string;
    meetingUrl?: string;
    details?: string;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const startsAt = body.startsAt === undefined ? undefined : Number(body.startsAt);
  if (startsAt !== undefined && startsAt < Date.now() - 60 * 60 * 1000) {
    return NextResponse.json({ error: "Invalid time" }, { status: 400 });
  }
  const updated = await updateEvent(id, userId, {
    type: body.type as never,
    title: body.title,
    startsAt,
    durationMin:
      body.durationMin === undefined ? undefined : Number(body.durationMin),
    passageRef: body.passageRef,
    meetingUrl: body.meetingUrl,
    details: body.details,
  });
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const deleted = await deleteEvent(id, userId);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
