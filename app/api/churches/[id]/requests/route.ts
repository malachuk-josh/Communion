import { NextResponse } from "next/server";
import { getDisplayName, getUserId } from "@/lib/auth";
import { getChurch, requestJoin } from "@/lib/churches";
import { emailEnabled, requestEmail, sendEmail } from "@/lib/email";

/** Ask to join a public church. Notifies the founder by email when possible. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    displayName?: string;
  } | null;
  const displayName = await getDisplayName(req, body?.displayName);

  const result = await requestJoin(id, userId, displayName);
  if (result === "not_found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (result === "member") {
    return NextResponse.json({ error: "Already a member" }, { status: 400 });
  }

  // best-effort founder notification
  if (emailEnabled()) {
    const church = await getChurch(id);
    if (church?.founderId.startsWith("user_")) {
      try {
        const { clerkClient } = await import("@clerk/nextjs/server");
        const client = await clerkClient();
        const founder = await client.users.getUser(church.founderId);
        const to = founder.primaryEmailAddress?.emailAddress;
        if (to) {
          const origin =
            process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
          const message = requestEmail(
            church.name,
            displayName,
            `${origin}/churches/${id}`
          );
          await sendEmail(to, message.subject, message.html);
        }
      } catch {
        // notification is best-effort; the request itself is stored
      }
    }
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
