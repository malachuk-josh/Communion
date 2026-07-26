import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getChurch, getRole } from "@/lib/churches";
import { addPrayer, listPrayers } from "@/lib/prayers";

/**
 * The prayer list of a Gathering. Members only, and deliberately unlike the
 * discussions beside it: a public Gathering opens its conversation to anyone
 * who wanders in, but not the things its members are carrying. Someone has to
 * be inside before they can read what was asked in confidence.
 */
export async function GET(
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
  return NextResponse.json({
    prayers: await listPrayers(id, userId),
    myUserId: userId,
    myRole: role,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!(await getRole(id, userId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as {
    text?: string;
    anonymous?: boolean;
  } | null;
  const text = body?.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Say what to pray for" }, { status: 400 });
  }
  const church = await getChurch(id);
  const prayer = await addPrayer(
    id,
    church?.name ?? "your Gathering",
    userId,
    text,
    body?.anonymous === true
  );
  return NextResponse.json({ prayer }, { status: 201 });
}
