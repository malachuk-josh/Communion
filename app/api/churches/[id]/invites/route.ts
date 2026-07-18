import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { createInvite, getRole } from "@/lib/churches";

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
  const token = await createInvite(id, userId);
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  return NextResponse.json(
    { token, url: `${origin}/join/${token}` },
    { status: 201 }
  );
}
