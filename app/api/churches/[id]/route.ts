import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getChurchDetail } from "@/lib/churches";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const church = await getChurchDetail(id, userId);
  if (!church) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ church, myUserId: userId });
}
