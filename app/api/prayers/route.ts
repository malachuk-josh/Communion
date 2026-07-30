import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getChurch, getRole } from "@/lib/churches";
import { addPrayer } from "@/lib/prayers";

/**
 * Ask for prayer without first going to find the room to ask it in.
 *
 * The wall used to be read-only, and the note on it told you to open the
 * Gathering you wanted to ask. That is the right model — a request belongs to
 * the people who will carry it, not to a noticeboard — but it is a poor way to
 * meet somebody at the moment they need to ask, and it made the commonest case
 * of all awkward: the same burden carried by two rooms you belong to, asked
 * twice by hand.
 *
 * So one request may be sent to several Gatherings at once, and what it makes
 * is one request per Gathering. Not a broadcast with copies: each room gets
 * its own, in its own list, prayed for by its own members and answered on its
 * own — which is what it means for a room to be carrying something. The only
 * thing shared is the words.
 */

/** More than anybody asks at once; a bound on what one request can fan out to. */
const MAX_TARGETS = 12;

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    text?: string;
    anonymous?: boolean;
    churchIds?: unknown;
  } | null;

  const text = body?.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Say what to pray for" }, { status: 400 });
  }

  const wanted = Array.isArray(body?.churchIds)
    ? [...new Set(body.churchIds.map(String))].slice(0, MAX_TARGETS)
    : [];
  if (wanted.length === 0) {
    return NextResponse.json(
      { error: "Choose at least one Gathering." },
      { status: 400 }
    );
  }

  /*
   * Membership is checked here and not taken on trust from the picker.
   *
   * The list the client shows is the list of Gatherings this reader belongs
   * to, but the list the client shows is not what makes it true — a prayer
   * request posted into a room somebody is not in would be a stranger's words
   * appearing in a private list.
   */
  const allowed: { id: string; name: string }[] = [];
  for (const id of wanted) {
    if (!(await getRole(id, userId))) continue;
    const church = await getChurch(id);
    if (church) allowed.push({ id, name: church.name });
  }
  if (allowed.length === 0) {
    return NextResponse.json(
      { error: "You are not in those Gatherings." },
      { status: 403 }
    );
  }

  const anonymous = body?.anonymous === true;
  const asked: { churchId: string; churchName: string }[] = [];
  for (const church of allowed) {
    await addPrayer(church.id, church.name, userId, text, anonymous);
    asked.push({ churchId: church.id, churchName: church.name });
  }
  return NextResponse.json({ asked }, { status: 201 });
}
