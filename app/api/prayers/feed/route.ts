import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { isOwner } from "@/lib/admin";
import { listPrayerFeed } from "@/lib/prayers";

/**
 * The prayer wall: what is being carried across every Gathering this reader
 * can see — the ones they belong to, and the ones open to all.
 *
 * Read only. Nothing is posted here; a request is asked for inside a
 * Gathering, and arrives on the wall by being asked there.
 *
 * Next resolves a static segment before a dynamic one, so this does not
 * collide with /api/prayers/[prayerId], which handles praying and moderating.
 */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    prayers: await listPrayerFeed(userId),
    myUserId: userId,
    // the wall spans many Gatherings and is founder of none, so the only
    // standing it can confer is the app owner's
    myRole: isOwner(userId) ? "founder" : "member",
  });
}
