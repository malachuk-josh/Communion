import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { isOwner } from "@/lib/admin";
import {
  addPublicPrayer,
  listPublicPrayers,
  wallAllowance,
} from "@/lib/prayers";

/**
 * The open prayer wall. No Gathering, no membership — anyone signed in or in
 * guest mode can read it and add to it.
 *
 * Next resolves a static segment before a dynamic one, so this does not
 * collide with /api/prayers/[prayerId]; that route handles praying, answering
 * and deleting for wall posts too, recognising them by an empty churchId.
 */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { left } = await wallAllowance(userId);
  return NextResponse.json({
    prayers: await listPublicPrayers(userId),
    myUserId: userId,
    // the wall has no founder; the app's owner is the only moderator
    myRole: isOwner(userId) ? "founder" : "member",
    left,
  });
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    text?: string;
    anonymous?: boolean;
  } | null;
  const text = body?.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Say what to pray for" }, { status: 400 });
  }
  const prayer = await addPublicPrayer(userId, text, body?.anonymous === true);
  if (!prayer) {
    return NextResponse.json(
      { error: "That is a lot of requests in one hour. Try again shortly." },
      { status: 429 }
    );
  }
  return NextResponse.json({ prayer }, { status: 201 });
}
