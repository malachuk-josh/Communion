import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import {
  pushEnabled,
  removeSubscription,
  saveSubscription,
  type PushSubscriptionJson,
} from "@/lib/push";

/** Register this device's push subscription for the signed-in user. */
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!pushEnabled()) {
    return NextResponse.json({ error: "push_unavailable" }, { status: 501 });
  }
  const body = (await req.json().catch(() => null)) as {
    subscription?: PushSubscriptionJson;
  } | null;
  const sub = body?.subscription;
  if (
    !sub?.endpoint ||
    !sub.endpoint.startsWith("https://") ||
    !sub.keys?.p256dh ||
    !sub.keys?.auth
  ) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }
  await saveSubscription(userId, {
    endpoint: sub.endpoint.slice(0, 1000),
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  return NextResponse.json({ ok: true });
}

/** Remove this device's subscription (notifications toggled off). */
export async function DELETE(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    endpoint?: string;
  } | null;
  if (!body?.endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }
  await removeSubscription(userId, body.endpoint);
  return NextResponse.json({ ok: true });
}
