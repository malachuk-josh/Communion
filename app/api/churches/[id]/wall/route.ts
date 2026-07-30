import { NextResponse } from "next/server";
import { getDisplayName, getUserId } from "@/lib/auth";
import { getChurch, getRole } from "@/lib/churches";
import { hangVerse, listWall, unhangVerse } from "@/lib/wall";

type Ctx = { params: Promise<{ id: string }> };

/**
 * A Gathering's wall.
 *
 * Read by its members, and by anyone at all where the Gathering is open —
 * the wall is the clearest statement a group makes about what it is built
 * on, and hiding that from somebody deciding whether to join would be hiding
 * the one thing worth deciding on. Hung by members only.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const userId = await getUserId(req);
  const church = await getChurch(id);
  if (!church) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const role = userId ? await getRole(id, userId) : null;
  if (!role && church.visibility !== "public") {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  return NextResponse.json({
    entries: await listWall({ churchId: id, userId: userId ?? "" }),
    canHang: !!role,
    // the founder can take down anything; everyone else, their own
    canCurate: !!userId && church.founderId === userId,
    myUserId: userId ?? "",
  });
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    key?: string;
    note?: string;
  } | null;
  const result = await hangVerse({
    churchId: id,
    userId,
    displayName: await getDisplayName(req),
    key: String(body?.key ?? ""),
    note: body?.note,
  });
  if (!result.ok) {
    const status =
      result.reason === "not_a_member"
        ? 403
        : result.reason === "no_such_wall"
          ? 404
          : result.reason === "full"
            ? 409
            : 400;
    const error =
      result.reason === "not_a_member"
        ? "Join the Gathering to hang a verse on its wall."
        : result.reason === "full"
          ? "This wall is full."
          : result.reason === "no_such_wall"
            ? "No such Gathering"
            : "Not a verse.";
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ entry: result.entry }, { status: 201 });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const gone = await unhangVerse({ churchId: id, userId, key });
  if (!gone) {
    return NextResponse.json(
      { error: "That is not yours to take down." },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: true });
}
