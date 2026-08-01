import { NextResponse } from "next/server";
import { getDisplayName, getUserId } from "@/lib/auth";
import { createChurch, listUserChurches, saveProfile } from "@/lib/churches";
import { keys } from "@/lib/db";
import { takeRateSlot, untilNext } from "@/lib/rateLimit";

export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const churches = await listUserChurches(userId);
  return NextResponse.json({ churches });
}

/**
 * How many Gatherings one person may start in half a day, and how long that
 * half day is.
 *
 * Five is far past what anyone founding something real will reach — a person
 * gathers a group, they do not mint groups — so the only account that ever
 * meets this is one making them faster than they can be meant.
 *
 * Deliberately unannounced. No counter, no "2 of 5 remaining", nothing on the
 * form: telling everybody about a ceiling none of them will touch teaches
 * ordinary people to think of the app as rationed, and tells the one person
 * who is flooding it exactly what shape the wall is. It is said once, to the
 * person refused, at the moment they are refused.
 */
const GATHERING_LIMIT = 5;
const GATHERING_WINDOW_MS = 12 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    description?: string;
    displayName?: string;
  } | null;

  const name = body?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  /*
   * Counted after the form is valid, so a mistyped submission never spends one
   * of the five — and taken BEFORE the Gathering is made, which is the part
   * that used to be wrong. Recording the slot afterwards left the whole of
   * createChurch sitting between the count and the mark, so requests fired
   * together all read the same count, all found room, and all went through.
   * The window a burst has to squeeze into is now as small as this store can
   * make it. The cost is that a create which fails still spends a slot, which
   * for a ceiling of five in twelve hours is the right way round.
   */
  const slot = await takeRateSlot(
    keys.churchRate(userId),
    GATHERING_LIMIT,
    GATHERING_WINDOW_MS
  );
  if (!slot.ok) {
    return NextResponse.json(
      {
        error:
          `You've started ${GATHERING_LIMIT} Gatherings in the last 12 hours. ` +
          `You can start another in about ${untilNext(slot.retryInMs)}.`,
      },
      { status: 429 }
    );
  }

  const displayName = await getDisplayName(req, body?.displayName);
  await saveProfile(userId, displayName);
  const church = await createChurch(userId, name, body?.description?.trim() ?? "");

  return NextResponse.json({ church }, { status: 201 });
}
