import { NextResponse } from "next/server";
import { getDisplayName, getUserId } from "@/lib/auth";
import { createChurch, listUserChurches, saveProfile } from "@/lib/churches";

export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const churches = await listUserChurches(userId);
  return NextResponse.json({ churches });
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    description?: string;
    displayName?: string;
  } | null;

  const name = body?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const displayName = await getDisplayName(req, body?.displayName);
  await saveProfile(userId, displayName);
  const church = await createChurch(userId, name, body?.description?.trim() ?? "");
  return NextResponse.json({ church }, { status: 201 });
}
