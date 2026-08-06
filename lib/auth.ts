// Auth abstraction: real Clerk sessions when keys are configured, otherwise a
// guest identity the server issues and signs. API routes never need to know
// which mode is active.

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { isDeactivated, isOwner } from "@/lib/admin";
import { actingAs } from "@/lib/impersonate";

const clerkEnabled = () => !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/*
 * Guest identity, and why it is no longer whatever the client says it is.
 *
 * It used to be read straight off an `x-guest-id` header, checked for shape
 * and nothing else. Nothing tied that string to a person, so it was not an
 * identity at all — it was a claim, and the app believed every claim. Anybody
 * who learned another guest's id (they travel: a shared collection, a listed
 * plan, an invite the server answered) could send it and *be* them — read
 * their messages, write as them, delete their Gatherings. It was also why
 * every per-person limit in the app was decorative, since a new header was a
 * new person with a fresh allowance.
 *
 * So the server issues it now. The header no longer says who you are; it says
 * only that this client wants a guest session, and a session it has never
 * seen before gets a brand new random one. What carries the identity is an
 * HttpOnly cookie the browser cannot read and the holder cannot alter without
 * the signature failing.
 *
 * This costs the guest data held by anyone who was relying on the old header
 * — their next visit is a new guest. Only deployments without Clerk are
 * affected, which is previews and local development; the live app has had
 * Clerk enforced throughout, and a forged header there has always been a 401.
 */
const GUEST_COOKIE = "communion_guest";
const GUEST_TTL_SECONDS = 400 * 24 * 60 * 60;

/**
 * What the cookie is signed with.
 *
 * No dedicated secret is required to run the app, so this takes the first
 * server-side secret the deployment already has. Any real deployment has one
 * of these; a bare local checkout has none, which is handled below.
 */
const guestSecret = (): string | null =>
  process.env.GUEST_SECRET ||
  process.env.CLERK_SECRET_KEY ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  null;

const sign = (id: string, secret: string) =>
  createHmac("sha256", secret).update(id).digest("base64url");

/** The id inside a cookie, or null if the cookie was not made by us. */
function unsign(value: string, secret: string): string | null {
  const cut = value.lastIndexOf(".");
  if (cut <= 0) return null;
  const id = value.slice(0, cut);
  const given = Buffer.from(value.slice(cut + 1));
  const want = Buffer.from(sign(id, secret));
  // constant time, and only after the lengths match — timingSafeEqual throws
  // on a length mismatch, which would itself be an oracle
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  return /^[\w-]{8,64}$/.test(id) ? id : null;
}

/** Whether this request reached us over TLS, proxies included. */
function isHttps(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

async function guestIdentity(req: Request): Promise<string | null> {
  // A client that never asks for a guest session does not get given one, or
  // every crawler and preflight would mint an account.
  const asking = req.headers.get("x-guest-id");
  if (!asking || !/^[\w-]{8,64}$/.test(asking)) return null;

  const secret = guestSecret();
  if (!secret) {
    /*
     * A checkout with no Clerk, no Upstash and no secret of its own. There is
     * no persistent store either — lib/db falls back to an in-memory map — so
     * there is no second person to impersonate and nothing that outlives the
     * process. Trusting the header here keeps `npm run dev` working with no
     * setup, which is the only situation this branch can be reached in.
     */
    return `guest_${asking}`;
  }

  const jar = await cookies();
  const held = jar.get(GUEST_COOKIE)?.value;
  const known = held ? unsign(held, secret) : null;
  if (known) return `guest_${known}`;

  const minted = randomBytes(18).toString("base64url");
  jar.set(GUEST_COOKIE, `${minted}.${sign(minted, secret)}`, {
    httpOnly: true,
    sameSite: "lax",
    // Secure everywhere it can be, which is everywhere this runs for real.
    // Set unconditionally it would be dropped over plain http, and Safari
    // counts http://localhost as plain http — so `npm run dev` there would
    // mint a new guest on every single request and nothing would ever save.
    secure: isHttps(req),
    path: "/",
    maxAge: GUEST_TTL_SECONDS,
  });
  return `guest_${minted}`;
}

/**
 * Whose session this actually is — before any standing-in is considered.
 *
 * Anything that decides what someone is *allowed* to do to the app itself
 * must ask this and not getUserId(), or the owner would lose the power to
 * stop standing in the moment they started.
 */
export async function getRealUserId(req: Request): Promise<string | null> {
  const who = await sessionUserId(req);
  /*
   * A switched-off account has no identity here, and that is the whole
   * mechanism. Every route in the app authorises through this function, so
   * answering null once refuses all of them at the same instant — there is no
   * list of endpoints to remember to guard, and no route added later that
   * forgets. They are still signed in with Clerk; they simply are not anybody
   * as far as Communion is concerned, until the owner switches them back on.
   *
   * Nothing of theirs is touched. See lib/admin.
   */
  if (await isDeactivated(who)) return null;
  return who;
}

/** Who the session says they are, before deactivation is considered. */
async function sessionUserId(req: Request): Promise<string | null> {
  if (clerkEnabled()) {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return userId;
  }
  return guestIdentity(req);
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
  const standingIn = await actingAs(req, real);
  if (!standingIn) return real;
  // Standing in a switched-off account would be the one way round the switch:
  // the owner would be able to act as somebody the app has stopped answering
  // to. Whatever needs doing in that account, switch it back on first.
  return (await isDeactivated(standingIn)) ? real : standingIn;
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
