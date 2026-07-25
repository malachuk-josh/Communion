import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listContacts, listConversations } from "@/lib/messages";
import { listUserThreads } from "@/lib/threads";

/**
 * Inbox: direct-message summaries, Fellowship discussions (each its own
 * conversation), and contacts for starting a new message.
 */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [conversations, contacts, threads] = await Promise.all([
    listConversations(userId),
    listContacts(userId),
    listUserThreads(userId),
  ]);
  return NextResponse.json({
    conversations,
    contacts,
    threads,
    myUserId: userId,
  });
}
