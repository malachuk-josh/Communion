import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getRole } from "@/lib/churches";
import { db, keys } from "@/lib/db";

/**
 * Who can be invited to a meeting — by name, never by address.
 *
 * This used to hand every member's real email address to any fellow member,
 * which was a leak rather than a feature: a public Gathering admits anyone
 * the instant they ask (see joinChurch), so "member" is not a boundary you
 * can put somebody's inbox behind. One join was a mailing list.
 *
 * So the picker works the way the rest of the app does — on ids. The client
 * learns who *has* an address and can therefore be ticked, and nothing more;
 * the id it sends back is resolved to an address inside /meet, on the server,
 * where the address was already known and never has to travel. `hasEmail` is
 * the whole of what leaves here about anybody's inbox.
 */
export async function GET(
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

  const kv = db();
  const raw = (await kv.hgetall(keys.churchMembers(id))) ?? {};
  const clerkOn = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const client = clerkOn
    ? await (await import("@clerk/nextjs/server")).clerkClient()
    : null;

  const members = await Promise.all(
    Object.keys(raw).map(async (memberId) => {
      const profile = await kv.hgetall(keys.user(memberId));
      let hasEmail = false;
      if (client && memberId.startsWith("user_")) {
        try {
          const user = await client.users.getUser(memberId);
          hasEmail = !!user.primaryEmailAddress?.emailAddress;
        } catch {
          // deleted user — nothing to invite
        }
      }
      return {
        userId: memberId,
        displayName: profile?.displayName ?? "Believer",
        hasEmail,
      };
    })
  );

  return NextResponse.json({ members });
}
