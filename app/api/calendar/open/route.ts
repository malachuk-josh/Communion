import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listOpenEvents } from "@/lib/churches";

/**
 * Upcoming sessions at open Gatherings the reader has not joined.
 *
 * Its own route rather than a flag on /api/calendar, because it is asked for
 * separately: the Gatherings page only requests this when the reader has the
 * switch on, and a reader who has turned it off should not be paying for a
 * sweep of the whole directory on every visit.
 *
 * What it returns is stripped of the meeting link, the arrangements and who
 * is coming — see listOpenEvents. Anyone signed out is answered the same way
 * as anyone signed in: these are the public rooms, and the only thing the
 * identity is used for is leaving out the ones already on the other list.
 */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  return NextResponse.json({ events: await listOpenEvents(userId) });
}
