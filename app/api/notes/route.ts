import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db, keys } from "@/lib/db";

/** All of the user's notes across every book — for the share picker. */
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const kv = db();
  const perBook = await Promise.all(
    Array.from({ length: 66 }, (_, i) =>
      kv.hgetall(keys.userNotes(userId, i + 1))
    )
  );
  const notes: { b: number; c: number; v: number; text: string }[] = [];
  perBook.forEach((bookNotes, i) => {
    for (const [ref, text] of Object.entries(bookNotes ?? {})) {
      const [c, v] = ref.split(":").map(Number);
      if (c && v) notes.push({ b: i + 1, c, v, text });
    }
  });
  notes.sort((a, b) => a.b - b.b || a.c - b.c || a.v - b.v);
  return NextResponse.json({ notes });
}
