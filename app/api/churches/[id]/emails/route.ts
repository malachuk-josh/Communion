import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getRole } from "@/lib/churches";
import { db, keys } from "@/lib/db";

// Member emails for the meeting-guest picker. Only visible to fellow
// members of the same Church. Guest-mode members have no email.

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
      let email: string | null = null;
      if (client && memberId.startsWith("user_")) {
        try {
          const user = await client.users.getUser(memberId);
          email = user.primaryEmailAddress?.emailAddress ?? null;
        } catch {
          // deleted user — no email
        }
      }
      return {
        userId: memberId,
        displayName: profile?.displayName ?? "Believer",
        email,
      };
    })
  );

  return NextResponse.json({ members });
}
