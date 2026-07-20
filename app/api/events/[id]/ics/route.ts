import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { buildIcs } from "@/lib/calendar";
import { getEventForMember } from "@/lib/churches";

// Served as a plain navigation link so iPhones/Macs open it straight into
// Apple Calendar. Guest mode can't send headers on a navigation, so the
// guest id rides along as ?g= (only honored while Clerk is not configured).

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId = await getUserId(req);
  if (!userId && !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    const guest = new URL(req.url).searchParams.get("g");
    if (guest && /^[\w-]{8,64}$/.test(guest)) userId = `guest_${guest}`;
  }
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const found = await getEventForMember(id, userId);
  if (!found) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const ics = buildIcs(found.event, found.churchName, origin);
  const filename = `${found.event.title.replace(/[^\w\- ]+/g, "").trim() || "session"}.ics`;

  return new NextResponse(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
