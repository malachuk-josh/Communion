import { NextResponse } from "next/server";
import { getDisplayName, getUserId } from "@/lib/auth";
import { getChurch, joinChurch } from "@/lib/churches";
import { emailEnabled, requestEmail, sendEmail } from "@/lib/email";
import { pushEnabled, sendPushToUser } from "@/lib/push";

/**
 * Join a Gathering. An open one admits at once; a private one asks its
 * founder. Either way the founder is told, by push and by email where those
 * are configured — the difference is whether there is anything to decide.
 */
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

  const result = await joinChurch(id, userId, displayName);
  if (result === "not_found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (result === "member") {
    return NextResponse.json({ error: "Already a member" }, { status: 400 });
  }
  const joined = result === "joined";

  // best-effort founder notification
  const churchForNotify = await getChurch(id);
  if (pushEnabled() && churchForNotify) {
    await sendPushToUser(churchForNotify.founderId, {
      title: `🙏 ${displayName}`,
      body: joined
        ? `joined ${churchForNotify.name}`
        : `asked to join ${churchForNotify.name}`,
      url: `/churches/${id}`,
      tag: `request-${id}-${userId}`,
    });
  }
  // An open Gathering has nothing for its founder to act on, so it does not
  // land in their inbox — the member list already says who is there.
  if (emailEnabled() && !joined) {
    const church = churchForNotify;
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

  return NextResponse.json({ joined }, { status: 201 });
}
