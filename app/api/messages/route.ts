import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listContacts, listConversations } from "@/lib/messages";

/** Inbox: conversation summaries plus church contacts to start new ones. */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [conversations, contacts] = await Promise.all([
    listConversations(userId),
    listContacts(userId),
  ]);
  return NextResponse.json({ conversations, contacts, myUserId: userId });
}
