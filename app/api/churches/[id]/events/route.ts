import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { createEvent, getRole, isSessionType } from "@/lib/churches";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const role = await getRole(id, userId);
  if (!role) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    type?: string;
    title?: string;
    startsAt?: number;
    durationMin?: number;
    passageRef?: string;
    meetingUrl?: string;
  } | null;

  const title = body?.title?.trim();
  const startsAt = Number(body?.startsAt);
  if (
    !body ||
    !isSessionType(body.type ?? "") ||
    !title ||
    !Number.isFinite(startsAt) ||
    startsAt < Date.now() - 60 * 60 * 1000
  ) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  const event = await createEvent(id, userId, {
    type: body.type as never,
    title,
    startsAt,
    durationMin: Number(body.durationMin) || 60,
    passageRef: body.passageRef?.trim() || undefined,
    meetingUrl: body.meetingUrl?.trim() || undefined,
  });
  return NextResponse.json({ event }, { status: 201 });
}
