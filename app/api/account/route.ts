import { NextResponse } from "next/server";
import { getRealUserId } from "@/lib/auth";
import { sameOrigin } from "@/lib/admin";
import { deleteAccount } from "@/lib/deleteAccount";
import { clearTicket } from "@/lib/impersonate";

export const dynamic = "force-dynamic";

/**
 * Delete your own account.
 *
 * The real session, never the effective one. Standing in somebody's account
 * is for looking at a fault from the inside, and an owner who forgot they
 * were doing it must not be able to delete the person they are standing in
 * by pressing a button meant for their own account. If you want to delete
 * somebody else's account you have to be them.
 *
 * Same-origin is checked for the reason the admin routes check it: with Clerk
 * this route is authorised by a cookie, and a cookie is authority a form on
 * another site can borrow. A one-click delete-everything link posted into a
 * Gathering would otherwise work on whoever opened it.
 *
 * The word has to be typed. Not decoration — this is the one action in the
 * app that cannot be undone, and a misplaced tap should not be able to reach
 * it.
 */
export async function DELETE(req: Request) {
  const userId = await getRealUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as {
    confirm?: string;
  } | null;
  if (body?.confirm !== "DELETE") {
    return NextResponse.json(
      { error: "Type DELETE to confirm." },
      { status: 400 }
    );
  }

  const erased = await deleteAccount(userId);

  /*
   * And the sign-in itself, where there is one.
   *
   * Clearing our own records but leaving the login would mean the next sign
   * in makes a fresh empty account under the same id — which is not what
   * anybody means by deleting their account, and is not what the stores mean
   * by it either. Done after the sweep: if Clerk is unreachable, this fails
   * with the data already gone rather than with the account gone and the data
   * still here.
   */
  let signInRemoved = false;
  if (
    userId.startsWith("user_") &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      await (await clerkClient()).users.deleteUser(userId);
      signInRemoved = true;
    } catch {
      // The records are gone, which is the part that matters and the part we
      // cannot do twice. The sign-in surviving means an empty account, not a
      // recovered one.
    }
  }

  const res = NextResponse.json({ ok: true, erased, signInRemoved });
  // whatever this browser was carrying, it is not carrying it any more
  clearTicket(res);
  res.cookies.set("communion_guest", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
