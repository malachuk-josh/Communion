import { NextResponse } from "next/server";
import { getRealUserId } from "@/lib/auth";
import { isOwner, sameOrigin } from "@/lib/admin";
import { askIds, setAsk } from "@/lib/ask";
import { db, keys } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Let someone ask questions in study mode, or stop them.
 *
 * The owner alone: every answer is paid for from the owner's API credit, so
 * who may spend it is the owner's decision every time, and not one a trusted
 * admin can make for them. The real session, as with trust, so standing in an
 * account does not take the switch away.
 */
export async function POST(req: Request) {
  const me = await getRealUserId(req);
  if (!isOwner(me) || !sameOrigin(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as {
    userId?: string;
    ask?: boolean;
  } | null;
  const userId = body?.userId?.trim();
  if (!userId || !/^[\w-]{3,80}$/.test(userId)) {
    return NextResponse.json({ error: "Which account?" }, { status: 400 });
  }
  if (isOwner(userId)) {
    return NextResponse.json(
      { error: "Owners always have it." },
      { status: 400 }
    );
  }
  // a signed-in person, for the same reason as trust: a guest is a browser,
  // and an allowance handed to a browser goes to whoever holds it next
  if (!userId.startsWith("user_")) {
    return NextResponse.json(
      { error: "Only a signed-in account can be given this." },
      { status: 400 }
    );
  }
  if (!(await db().hgetall(keys.user(userId)))) {
    return NextResponse.json({ error: "No such account." }, { status: 404 });
  }

  await setAsk(userId, body?.ask === true);
  return NextResponse.json({
    ok: true,
    ask: (await askIds()).includes(userId),
  });
}
