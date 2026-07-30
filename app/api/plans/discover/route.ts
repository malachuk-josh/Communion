import { NextResponse } from "next/server";
import { listPublicPlans } from "@/lib/customPlans";

/**
 * The plans people have put where anybody can find them.
 *
 * No auth: a shelf you have to sign in to look at is a shelf nobody browses,
 * and everything on it was published by somebody choosing to publish it. The
 * cards carry no ids and no account — a name, who wrote it, how long it is,
 * and the token that opens it.
 */
export async function GET() {
  return NextResponse.json({ plans: await listPublicPlans() });
}
