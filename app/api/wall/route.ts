import { NextResponse } from "next/server";
import { getDisplayName, getUserId } from "@/lib/auth";
import { seedDefaultWall } from "@/lib/defaultWall";
import { hangVerse, listWall, unhangVerse } from "@/lib/wall";

// A reader's own wall: the verses on their home screen. No membership to
// check — it is theirs — so this is the same three verbs with the church
// scope left off.

export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // first sight of this wall hangs the four it starts with
  await seedDefaultWall(userId, await getDisplayName(req)).catch(() => {});
  return NextResponse.json({ entries: await listWall({ userId }) });
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    key?: string;
    note?: string;
  } | null;
  const result = await hangVerse({
    userId,
    displayName: await getDisplayName(req),
    key: String(body?.key ?? ""),
    note: body?.note,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === "full" ? "Your wall is full." : "Not a verse." },
      { status: result.reason === "full" ? 409 : 400 }
    );
  }
  return NextResponse.json({ entry: result.entry }, { status: 201 });
}

export async function DELETE(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const gone = await unhangVerse({ userId, key });
  if (!gone) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
