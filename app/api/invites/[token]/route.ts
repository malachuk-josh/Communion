import { NextResponse } from "next/server";
import { getDisplayName, getUserId } from "@/lib/auth";
import { addMember, getChurch, getInvite, saveProfile } from "@/lib/churches";
import { db, keys } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";

/** Public invite preview — church name + who invited (no membership data). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const invite = await getInvite(token);
  if (!invite) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }
  const church = await getChurch(invite.churchId);
  if (!church) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }
  const inviter = await db().hgetall(keys.user(invite.invitedBy));
  return NextResponse.json({
    invite: {
      token,
      churchId: church.id,
      churchName: church.name,
      invitedByName: inviter?.displayName ?? "A believer",
    },
  });
}

/** Redeem: join the Church. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { token } = await params;
  const invite = await getInvite(token);
  if (!invite) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }
  // The Gathering is confirmed before anybody is added to it. A token outlives
  // the room it opened — invites are keyed by token, so deleting a Gathering
  // cannot find them — and redeeming a stale one used to write a membership
  // into a hash nothing reads and put a dead id in the reader's own list,
  // leaving a Gathering on their screen that opens onto nothing.
  const church = await getChurch(invite.churchId);
  if (!church) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as {
    displayName?: string;
  } | null;
  const displayName = await getDisplayName(req, body?.displayName);
  await saveProfile(userId, displayName);
  await addMember(invite.churchId, userId);

  // welcome the newcomer, and tell whoever invited them they arrived
  await sendPushToUser(userId, {
    title: `⛪ ${church.name}`,
    body: "You've joined the Gathering — welcome!",
    url: `/churches/${church.id}`,
    tag: `welcome-${church.id}`,
  }).catch(() => {});
  if (invite.invitedBy && invite.invitedBy !== userId) {
    await sendPushToUser(invite.invitedBy, {
      title: `⛪ ${church.name}`,
      body: `${displayName} accepted your invitation.`,
      url: `/churches/${church.id}`,
      tag: `joined-${church.id}-${userId}`,
    }).catch(() => {});
  }
  return NextResponse.json({ churchId: invite.churchId });
}
