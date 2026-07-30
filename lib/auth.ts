// Auth abstraction: real Clerk sessions when keys are configured, otherwise a
// guest identity supplied by the client (x-guest-id header, generated once and
// kept in localStorage). API routes never need to know which mode is active.

import { isOwner } from "@/lib/admin";
import { actingAs } from "@/lib/impersonate";

const clerkEnabled = () => !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Whose session this actually is — before any standing-in is considered.
 *
 * Anything that decides what someone is *allowed* to do to the app itself
 * must ask this and not getUserId(), or the owner would lose the power to
 * stop standing in the moment they started.
 */
export async function getRealUserId(req: Request): Promise<string | null> {
  if (clerkEnabled()) {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return userId;
  }
  const guestId = req.headers.get("x-guest-id");
  return guestId && /^[\w-]{8,64}$/.test(guestId) ? `guest_${guestId}` : null;
}

/**
 * Whose data this request is about.
 *
 * Normally the same person as above. It differs only while the owner is
 * standing in another account from the dashboard, and only for as long as
 * the owner is still the owner — the check below runs on every request, so
 * the power ends with the session that was granted it rather than with the
 * cookie that carried it. Everyone who is not an owner takes the fast path
 * and pays nothing for the feature existing.
 */
export async function getUserId(req: Request): Promise<string | null> {
  const real = await getRealUserId(req);
  if (!real || !isOwner(real)) return real;
  return (await actingAs(req, real)) ?? real;
}

/**
 * A name, never an address.
 *
 * An account with no name on it used to fall back to its email, and a name in
 * this app is not a private thing: it goes on member lists, on the verses you
 * hang, on the searchable directory, and — through a shared collection or a
 * listed reading plan — onto pages that need no account at all to read. So
 * somebody who signed up with an email and never filled in a name was
 * publishing that email by using the app normally, without being told and
 * without a way to see it had happened.
 *
 * The part before the @ is kept, because it is usually their name and is what
 * they would have typed. Everything after it goes.
 */
export function nameNotAddress(name: string): string {
  const trimmed = name.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return trimmed;
  return trimmed.slice(0, trimmed.indexOf("@"));
}

/** Best display name available: what they chose, else Clerk, else the client. */
export async function getDisplayName(
  req: Request,
  bodyName?: string
): Promise<string> {
  // A visit must not rename the person visited. Standing in someone's account
  // and starting a Gathering would otherwise write the OWNER's Clerk name over
  // their profile, which is the one trace of a look round nobody should leave.
  const real = await getRealUserId(req);
  const standingIn = real && isOwner(real) ? await actingAs(req, real) : null;
  if (standingIn) {
    const { db, keys } = await import("@/lib/db");
    const profile = await db().hgetall(keys.user(standingIn));
    return nameNotAddress(profile?.displayName || "") || "Believer";
  }

  /*
   * What they set in Settings comes first, ahead of Clerk.
   *
   * That screen says the name is "shown on member lists, RSVPs, and join
   * requests", and until now it was not: Clerk's name won every time, so a
   * reader who went to Settings precisely to stop being called by their email
   * address changed nothing that anybody else could see. The remedy for the
   * exposure above has to actually work, and this is the line that makes it.
   */
  const me = await getRealUserId(req);
  if (me) {
    const { db, keys } = await import("@/lib/db");
    const mine = (await db().hgetall(keys.user(me)))?.displayName?.trim();
    if (mine) return nameNotAddress(mine) || "Believer";
  }

  if (clerkEnabled()) {
    const { currentUser } = await import("@clerk/nextjs/server");
    const user = await currentUser();
    const name =
      user?.fullName ||
      user?.firstName ||
      user?.primaryEmailAddress?.emailAddress;
    if (name) return nameNotAddress(name) || "Believer";
  }
  const trimmed = bodyName?.trim();
  return trimmed ? nameNotAddress(trimmed).slice(0, 60) || "Believer" : "Believer";
}
