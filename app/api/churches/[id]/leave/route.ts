import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { leaveChurch } from "@/lib/churches";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const result = await leaveChurch(id, userId);
  if (result === "not_member") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (result === "founder") {
    return NextResponse.json(
      { error: "The founder cannot leave their Church" },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
