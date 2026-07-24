import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getRole } from "@/lib/churches";

// One-click Google Meet: creates a real Calendar event (with Meet link) on
// the organizer's Google account using the OAuth token Clerk holds from
// "Sign in with Google", and emails invitations to the selected members.
// Returns 501 when the token or Calendar scope is unavailable so the client
// can fall back to the pre-filled Google Calendar template link.

const CALENDAR_API =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

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
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !userId.startsWith("user_")) {
    return NextResponse.json({ error: "oauth_unavailable" }, { status: 501 });
  }

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    startsAt?: number;
    durationMin?: number;
    details?: string;
    guests?: string[];
  } | null;
  if (!body?.title || !body.startsAt) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  let token: string | undefined;
  try {
    const client = await (await import("@clerk/nextjs/server")).clerkClient();
    const res = await client.users.getUserOauthAccessToken(userId, "google");
    token = res.data[0]?.token;
  } catch {
    token = undefined;
  }
  if (!token) {
    return NextResponse.json({ error: "oauth_unavailable" }, { status: 501 });
  }

  const start = new Date(body.startsAt);
  const end = new Date(
    body.startsAt + Math.min(Math.max(body.durationMin ?? 60, 5), 1440) * 60000
  );
  const guests = (body.guests ?? [])
    .filter((g) => typeof g === "string" && /^[^@\s]+@[^@\s]+$/.test(g))
    .slice(0, 50);

  const res = await fetch(
    `${CALENDAR_API}?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        summary: body.title.slice(0, 200),
        description: (body.details ?? "").slice(0, 2000),
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        attendees: guests.map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    }
  );

  if (!res.ok) {
    // 401/403 → token lacks the Calendar scope (Clerk Google connection not
    // configured with it, or the user signed in with email). Fall back.
    const status = res.status === 401 || res.status === 403 ? 501 : 502;
    return NextResponse.json({ error: "calendar_failed" }, { status });
  }

  const created = (await res.json()) as {
    hangoutLink?: string;
    htmlLink?: string;
    conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
  };
  const meetUrl =
    created.hangoutLink ||
    created.conferenceData?.entryPoints?.find(
      (e) => e.entryPointType === "video"
    )?.uri;

  if (!meetUrl) {
    return NextResponse.json({ error: "calendar_failed" }, { status: 502 });
  }
  return NextResponse.json({ meetUrl, eventUrl: created.htmlLink ?? null });
}
