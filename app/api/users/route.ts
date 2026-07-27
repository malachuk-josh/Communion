import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { searchDirectory } from "@/lib/directory";

/**
 * Believers who can be written to, by name.
 *
 * Only those listed in the directory, which is to say only those who have not
 * set their profile to private — the filter is that they are absent from what
 * this reads, so there is nothing here that could forget to apply it.
 */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const query = new URL(req.url).searchParams.get("q") ?? "";
  const users = await searchDirectory(userId, query.slice(0, 60));
  return NextResponse.json({ users });
}
