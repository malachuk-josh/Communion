import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import {
  addPrayer,
  changePrayer,
  listPrayers,
  moveOldPrayers,
  removePrayer,
  type Change,
} from "@/lib/prayers";

// The reader's prayer list, under the verses on their wall. Only the reader
// can read it or write to it; there is no way to name anybody else's.

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();
  // the first sight of the list brings over what they asked in the Gatherings
  await moveOldPrayers(userId).catch(() => {});
  return NextResponse.json({ prayers: await listPrayers(userId) });
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();
  const body = (await req.json().catch(() => null)) as { text?: string } | null;
  const result = await addPrayer(userId, String(body?.text ?? ""));
  if (!result.ok) {
    return result.reason === "full"
      ? NextResponse.json({ error: "Your prayer list is full." }, { status: 409 })
      : NextResponse.json({ error: "Write the prayer first." }, { status: 400 });
  }
  return NextResponse.json({ prayer: result.prayer }, { status: 201 });
}

export async function PATCH(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    action?: string;
    text?: string;
    answer?: string;
    day?: string;
    prayed?: boolean;
  } | null;

  let change: Change | null = null;
  if (body?.action === "edit") change = { action: "edit", text: String(body.text ?? "") };
  else if (body?.action === "answer") change = { action: "answer", answer: body.answer };
  else if (body?.action === "reopen") change = { action: "reopen" };
  else if (body?.action === "prayed") {
    change = { action: "prayed", day: String(body.day ?? ""), prayed: !!body.prayed };
  }
  if (!body?.id || !change) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const result = await changePrayer(userId, String(body.id), change);
  if (!result.ok) {
    return result.reason === "missing"
      ? NextResponse.json({ error: "Not found" }, { status: 404 })
      : NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  return NextResponse.json({ prayer: result.prayer });
}

export async function DELETE(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!(await removePrayer(userId, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
