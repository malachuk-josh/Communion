import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { createInvite, getChurch, getRole } from "@/lib/churches";
import { db, keys } from "@/lib/db";
import { emailEnabled, inviteEmail, sendEmail } from "@/lib/email";

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

  const token = await createInvite(id, userId);
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const url = `${origin}/join/${token}`;

  // Optional server-side email delivery (active once Brevo is configured)
  const email = body?.email?.trim();
  let sent = false;
  if (email && emailEnabled()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
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
