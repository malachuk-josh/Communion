import { NextResponse } from "next/server";
import { getRealUserId } from "@/lib/auth";
import { isOwner, recordTakeover, sameOrigin } from "@/lib/admin";
import { db, keys } from "@/lib/db";
import {
  clearTicket,
  impersonationEnabled,
  mintTicket,
  setTicket,
} from "@/lib/impersonate";

export const dynamic = "force-dynamic";

/**
 * Start standing in an account.
 *
 * Owner only. Not trusted admins: reading the dashboard is a report, and
 * being somebody is a different thing entirely — it can post as them, write
 * to their journal, and leave their Gatherings. That stays with the one
 * person who answers for the app.
 */
export async function POST(req: Request) {
  const me = await getRealUserId(req);
  if (!isOwner(me) || !sameOrigin(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!impersonationEnabled()) {
    return NextResponse.json(
      {
        error:
          "Set ADMIN_SESSION_SECRET in the environment first — without a key to sign with, this would be a cookie anyone could write.",
      },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => null)) as { userId?: string } | null;
  const target = body?.userId?.trim();
  if (!target || !/^[\w-]{3,80}$/.test(target)) {
    return NextResponse.json({ error: "Which account?" }, { status: 400 });
  }
  if (target === me) {
    return NextResponse.json({ error: "That is you." }, { status: 400 });
  }
  if (isOwner(target)) {
    return NextResponse.json(
      { error: "An owner's account cannot be stood in." },
      { status: 400 }
    );
  }

  // An id nobody has ever used is not an account. Minting a ticket for one
  // would conjure the user into being the moment any screen wrote to it — a
  // profile row, a directory listing, a name — so it is refused here.
  const profile = await db().hgetall(keys.user(target));
  const theirGatherings = await db().smembers(keys.userChurches(target));
  if (!profile && theirGatherings.length === 0) {
    return NextResponse.json({ error: "No such account." }, { status: 404 });
  }

  const ticket = await mintTicket(me!, target);
  if (!ticket) {
    return NextResponse.json({ error: "Could not sign." }, { status: 503 });
  }
  await recordTakeover(me!, target);

  const name = profile?.displayName || target;
  const res = NextResponse.json({ ok: true, as: target, name });
  setTicket(res, ticket, name);
  return res;
}

/**
 * Stop.
 *
 * No gate: the only thing this can do is put someone back to being
 * themselves, and there is no state of the app where that should be refused.
 */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearTicket(res);
  return res;
}
