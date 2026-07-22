import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listPublicChurches, listPublicGatherings } from "@/lib/churches";

// Public directory of churches and upcoming public gatherings —
// visible to everyone, signed in or not.
export async function GET(req: Request) {
  const userId = await getUserId(req);
  const [churches, gatherings] = await Promise.all([
    listPublicChurches(userId),
    listPublicGatherings(),
  ]);
  return NextResponse.json({ churches, gatherings });
}
