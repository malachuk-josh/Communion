import { NextResponse } from "next/server";
import { getRealUserId } from "@/lib/auth";
import {
  deactivatedIds,
  isOwner,
  sameOrigin,
  setDeactivated,
} from "@/lib/admin";
import { db, keys } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Switch an account off, or back on.
 *
 * The owner alone. A trusted admin can already remove a Gathering, which is
 * the largest thing they can do to a room — but this is the largest thing
 * anyone can do to a person, and it is the one power that could be turned on
 * the people who granted it. It stays where trust and standing-in stay.
 *
 * The real session, not the effective one, so the owner does not lose this by
 * standing in somebody's account — and so that standing in an account can
 * never be used to reach it from the inside.
 *
 * 404 rather than 403 for a caller with no business here, matching the other
 * admin routes: a screen that does not exist for you should not confirm that
 * it exists for somebody else.
 */
export async function POST(req: Request) {
  const me = await getRealUserId(req);
  if (!isOwner(me) || !sameOrigin(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as {
    userId?: string;
    deactivated?: boolean;
  } | null;
  const userId = body?.userId?.trim();
  if (!userId || !/^[\w-]{3,80}$/.test(userId)) {
    return NextResponse.json({ error: "Which account?" }, { status: 400 });
  }
  if (isOwner(userId)) {
    return NextResponse.json(
      { error: "An owner cannot be switched off." },
      { status: 400 }
    );
  }

  /*
   * The account has to exist, and "exists" means different things for the two
   * kinds. A signed-in account is real whether or not it has ever written
   * anything here, so Clerk is asked. A guest is only ever known by what it
   * has done, so its profile hash is the only evidence there is.
   */
  const known = !!(await db().hgetall(keys.user(userId)))?.displayName;
  if (!known) {
    let clerkKnows = false;
    if (userId.startsWith("user_") && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
      try {
        const { clerkClient } = await import("@clerk/nextjs/server");
        await (await clerkClient()).users.getUser(userId);
        clerkKnows = true;
      } catch {
        // no such account, or Clerk is unreachable — either way, not found
      }
    }
    if (!clerkKnows) {
      return NextResponse.json({ error: "No such account." }, { status: 404 });
    }
  }

  const off = body?.deactivated === true;
  await setDeactivated(userId, off, me!);
  return NextResponse.json({
    ok: true,
    deactivated: (await deactivatedIds()).has(userId),
  });
}
