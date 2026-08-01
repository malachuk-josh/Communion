import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { createInvite, getChurch, getRole } from "@/lib/churches";
import { db, keys } from "@/lib/db";
import { emailEnabled, inviteEmail, sendEmail } from "@/lib/email";
import { takeRateSlot, untilNext } from "@/lib/rateLimit";

/**
 * A ceiling on invitations, because this is the one route in the app that
 * sends mail to an address the sender chose. Without it, any member of any
 * Gathering — and a public Gathering admits anyone instantly — could point
 * the app's own mail reputation at a list of strangers.
 *
 * Twenty an hour is more than a real invitation night and useless as a
 * cannon.
 */
const INVITE_LIMIT = 20;
const INVITE_WINDOW_MS = 60 * 60_000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const role = await getRole(id, userId);
  if (!role) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    lang?: string;
  } | null;

  // Optional server-side email delivery (active once Brevo is configured).
  // Checked before the invite is created: an address we will refuse should
  // not leave a live token behind it.
  const email = body?.email?.trim() ?? "";
  const mailing = email !== "" && emailEnabled();
  if (mailing) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    const slot = await takeRateSlot(
      keys.inviteRate(userId),
      INVITE_LIMIT,
      INVITE_WINDOW_MS
    );
    if (!slot.ok) {
      return NextResponse.json(
        {
          error: `That's a lot of invitations. Try again in ${untilNext(slot.retryInMs)}.`,
        },
        { status: 429 }
      );
    }
  }

  const token = await createInvite(id, userId);
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const url = `${origin}/join/${token}`;

  let sent = false;
  if (mailing) {
    const church = await getChurch(id);
    const inviter = await db().hgetall(keys.user(userId));
    const message = inviteEmail(
      body?.lang === "es" ? "es" : "en",
      church?.name ?? "our Church",
      inviter?.displayName ?? "A believer",
      url
    );
    sent = await sendEmail(email, message.subject, message.html);
    if (!sent) {
      return NextResponse.json({ error: "Email failed" }, { status: 502 });
    }
  }

  return NextResponse.json(
    { token, url, emailEnabled: emailEnabled(), sent },
    { status: 201 }
  );
}
