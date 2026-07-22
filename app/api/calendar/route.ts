import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listUserEvents } from "@/lib/churches";

/** The signed-in user's upcoming sessions across all their churches. */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const events = await listUserEvents(userId);
  return NextResponse.json({ events, myUserId: userId });
}
