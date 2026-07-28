// Standing in someone else's account for a while, and coming back out.
//
// Some faults cannot be seen from outside the account they happen in — a
// Gathering that will not load for one person, a bookmark that will not sync,
// a screen that reads wrongly only when the data behind it is theirs. The
// owner needs to be able to look, and no description of the problem is a
// substitute for looking.
//
// That is a large power, so it is fenced four ways:
//
//   it proves nothing on its own   the ticket redirects a session that is
//                                  ALREADY signed in as the owner. Every
//                                  request re-checks that the holder is still
//                                  the owner, so a copied cookie is worth
//                                  nothing without the owner's own login.
//
//   it is signed                   HMAC-SHA256 over the claim, so nobody can
//                                  write their own. Without a secret to sign
//                                  with, the whole feature is off rather than
//                                  quietly unsigned.
//
//   it expires                     an hour, then it stops working by itself,
//                                  whether or not anyone remembered to stop.
//
//   it is written down             lib/admin.ts records every take-over. A
//                                  power with no record of its use is one
//                                  nobody can be held to.

import type { NextResponse } from "next/server";

/** The signed claim. httpOnly — no script ever needs to read it. */
const TICKET = "communion.actas";
/** Who is being stood in for, readable by the banner. Display only. */
const LABEL = "communion.actas.who";
/** Long enough to find a fault, short enough to be a visit rather than a seat. */
const MAX_AGE_SECONDS = 60 * 60;

interface Claim {
  /** the account being stood in */
  as: string;
  /** the owner who asked, checked against the live session on every request */
  by: string;
  /** when it was issued */
  at: number;
}

function secret(): string | null {
  // Without real accounts there is no session to bind a ticket to, so this
  // reads the same key the sessions themselves are signed with — if that is
  // absent, so is Clerk, and so is the feature.
  const configured =
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.CLERK_SECRET_KEY?.trim();
  return configured || null;
}

/**
 * Whether standing in an account is possible here at all.
 *
 * Two conditions, and the second is the load-bearing one. Without Clerk the
 * app trusts an `x-guest-id` header for identity, which means "is this the
 * owner" would be a question anyone could answer yes to by typing — and the
 * whole safety of this feature rests on that question being hard. So in guest
 * mode it does not exist, on the minting side and on the verifying side both.
 */
export function impersonationEnabled(): boolean {
  return !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!secret();
}

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value: string): string =>
  atob(value.replace(/-/g, "+").replace(/_/g, "/"));

async function sign(payload: string): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    material,
    encoder.encode(payload)
  );
  return toBase64Url(new Uint8Array(signature));
}

/** Compare without leaking where the difference was. */
function sameSignature(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Read one cookie off a request without pulling in a parser. */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export async function mintTicket(
  ownerId: string,
  targetId: string
): Promise<string | null> {
  if (!impersonationEnabled()) return null; // the same gate as the verifier
  const claim: Claim = { as: targetId, by: ownerId, at: Date.now() };
  const body = toBase64Url(encoder.encode(JSON.stringify(claim)));
  const signature = await sign(body);
  return signature ? `${body}.${signature}` : null;
}

/**
 * Who this request is acting as, if anyone.
 *
 * `realUserId` is who the session actually belongs to. The claim is only
 * honoured when it was issued to that very session — which is what makes a
 * leaked cookie inert, and what makes the power end the moment the owner
 * signs out or is removed from the owner list.
 */
export async function actingAs(
  req: Request,
  realUserId: string
): Promise<string | null> {
  if (!impersonationEnabled()) return null; // fail closed, before any compare
  const raw = readCookie(req, TICKET);
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;

  const body = raw.slice(0, dot);
  const expected = await sign(body);
  if (!expected || !sameSignature(expected, raw.slice(dot + 1))) return null;

  let claim: Claim;
  try {
    claim = JSON.parse(fromBase64Url(body)) as Claim;
  } catch {
    return null;
  }
  if (typeof claim?.as !== "string" || typeof claim?.by !== "string") return null;
  if (typeof claim?.at !== "number") return null;
  if (claim.by !== realUserId) return null; // issued to somebody else's session
  if (claim.as === realUserId) return null; // a ticket back to yourself is none
  if (Date.now() - claim.at > MAX_AGE_SECONDS * 1000) return null;
  return claim.as;
}

/** Both cookies carry the same lifetime, so the banner cannot outlive the power. */
export function setTicket(
  res: NextResponse,
  ticket: string,
  label: string
): void {
  const common = {
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
  res.cookies.set(TICKET, ticket, { ...common, httpOnly: true });
  res.cookies.set(LABEL, label.slice(0, 60), { ...common, httpOnly: false });
}

export function clearTicket(res: NextResponse): void {
  const common = {
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
  res.cookies.set(TICKET, "", { ...common, httpOnly: true });
  res.cookies.set(LABEL, "", { ...common, httpOnly: false });
}
