import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listPublicChurches } from "@/lib/churches";

// Public directory of churches — visible to everyone, signed in or not.
export async function GET(req: Request) {
  const userId = await getUserId(req);
  const churches = await listPublicChurches(userId);
  return NextResponse.json({ churches });
}
