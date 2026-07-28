import { NextResponse } from "next/server";
import { getRealUserId } from "@/lib/auth";
import { isOwner, sameOrigin, setTrusted, trustedIds } from "@/lib/admin";
import { db, keys } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Switch someone's trusted status on or off.
 *
 * The owner alone, and deliberately not "anyone with the dashboard": if a
 * trusted person could grant trust, one bad grant would be enough to hand the
 * app to a stranger with the owner never in the loop. Growing that circle
 * always costs the owner a decision.
 *
 * The real session, not the effective one, so the owner does not lose this by
 * standing in somebody's account.
 */
export async function POST(req: Request) {
  const me = await getRealUserId(req);
  if (!isOwner(me) || !sameOrigin(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as {
    userId?: string;
    trusted?: boolean;
  } | null;
  const userId = body?.userId?.trim();
  if (!userId || !/^[\w-]{3,80}$/.test(userId)) {
    return NextResponse.json({ error: "Which account?" }, { status: 400 });
  }
  if (isOwner(userId)) {
    return NextResponse.json(
      { error: "That account is an owner already." },
      { status: 400 }
    );
  }
  // A signed-in account, and one that exists. A guest identity is a browser
  // rather than a person — it is whoever holds the id, and it disappears when
  // the browser is cleared, which is not something to hand the dashboard to.
  if (!userId.startsWith("user_")) {
    return NextResponse.json(
      { error: "Only a signed-in account can be trusted with this." },
      { status: 400 }
    );
  }
  if (!(await db().hgetall(keys.user(userId)))) {
    return NextResponse.json({ error: "No such account." }, { status: 404 });
  }

  await setTrusted(userId, body?.trusted === true);
  return NextResponse.json({
    ok: true,
    trusted: (await trustedIds()).includes(userId),
  });
}
