import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getBook } from "@/lib/bible";
import { db, keys } from "@/lib/db";

// The outbox drains here. Every operation is a statement of intent — "this
// bookmark exists with this label", not "toggle this bookmark" — so replaying
// one that already landed is harmless. That matters: a phone that loses signal
// mid-flush will send the same batch again.

const MAX_OPS = 500;
const MAX_BOOKMARKS = 200;

type Op =
  | { kind: "bookmark.set"; key: string; t: number; l?: string; c?: string }
  | { kind: "bookmark.del"; key: string }
  | { kind: "collection.set"; id: string; name: string }
  | { kind: "collection.del"; id: string }
  | { kind: "note.set"; book: number; ref: string; text: string };

const VERSE_KEY = /^\d{1,2}:\d{1,3}:\d{1,3}$/;
const NOTE_REF = /^\d{1,3}:\d{1,3}$/;

/** A verse key only counts if the book, chapter and verse actually exist. */
function validVerseKey(key: string): boolean {
  if (!VERSE_KEY.test(key)) return false;
  const [b, c, v] = key.split(":").map(Number);
  const book = getBook(b);
  return !!book && c >= 1 && c <= book.chapters && v >= 1 && v <= 200;
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { ops?: Op[] } | null;
  const ops = Array.isArray(body?.ops) ? body!.ops.slice(0, MAX_OPS) : [];

  const kv = db();
  let applied = 0;
  let rejected = 0;

  // Creations first. The client queues each change as it happens, so a
  // bookmark filed into a brand-new collection can reach us before the
  // collection does; applying it then would silently unfile the bookmark.
  const ordered = [
    ...ops.filter((o) => o?.kind === "collection.set"),
    ...ops.filter((o) => o?.kind !== "collection.set"),
  ];

  for (const op of ordered) {
    try {
      switch (op?.kind) {
        case "bookmark.set": {
          if (!validVerseKey(op.key)) {
            rejected++;
            break;
          }
          const existing = (await kv.hgetall(keys.userBookmarks(userId))) ?? {};
          // make room the same way the toggle route does: oldest goes first
          if (!(op.key in existing) && Object.keys(existing).length >= MAX_BOOKMARKS) {
            const oldest = Object.entries(existing).sort((a, b) => {
              const ta = Number(JSON.parse(a[1] || "{}")?.t ?? 0);
              const tb = Number(JSON.parse(b[1] || "{}")?.t ?? 0);
              return ta - tb;
            })[0];
            if (oldest) await kv.hdel(keys.userBookmarks(userId), oldest[0]);
          }
          const entry: { t: number; l?: string; c?: string } = {
            t: Number(op.t) || Date.now(),
          };
          const label = op.l?.trim().slice(0, 120);
          if (label) entry.l = label;
          if (op.c) {
            const colls = (await kv.hgetall(keys.userCollections(userId))) ?? {};
            // a collection created in the same batch is already here; one
            // that never existed is dropped rather than dangling
            if (op.c in colls) entry.c = op.c;
          }
          await kv.hset(keys.userBookmarks(userId), {
            [op.key]: JSON.stringify(entry),
          });
          applied++;
          break;
        }
        case "bookmark.del": {
          if (!VERSE_KEY.test(op.key)) {
            rejected++;
            break;
          }
          await kv.hdel(keys.userBookmarks(userId), op.key);
          applied++; // deleting what is already gone is still success
          break;
        }
        case "collection.set": {
          const name = op.name?.trim().slice(0, 80);
          if (!op.id || !/^[a-z0-9]{1,32}$/i.test(op.id) || !name) {
            rejected++;
            break;
          }
          const colls = (await kv.hgetall(keys.userCollections(userId))) ?? {};
          let value: Record<string, unknown> = { name };
          if (colls[op.id]) {
            try {
              value = { ...JSON.parse(colls[op.id]), name }; // keep the share token
            } catch {
              // corrupted entry — replace it
            }
          }
          await kv.hset(keys.userCollections(userId), {
            [op.id]: JSON.stringify(value),
          });
          applied++;
          break;
        }
        case "collection.del": {
          if (!op.id) {
            rejected++;
            break;
          }
          await kv.hdel(keys.userCollections(userId), op.id);
          // detach its bookmarks, exactly as the collection route does
          const marks = (await kv.hgetall(keys.userBookmarks(userId))) ?? {};
          const updates: Record<string, string> = {};
          for (const [key, raw] of Object.entries(marks)) {
            try {
              const entry = JSON.parse(raw);
              if (entry?.c === op.id) {
                delete entry.c;
                updates[key] = JSON.stringify(entry);
              }
            } catch {
              // leave unparseable entries alone
            }
          }
          if (Object.keys(updates).length > 0) {
            await kv.hset(keys.userBookmarks(userId), updates);
          }
          applied++;
          break;
        }
        case "note.set": {
          const book = getBook(Number(op.book));
          if (!book || !NOTE_REF.test(op.ref ?? "")) {
            rejected++;
            break;
          }
          const chapter = Number(op.ref.split(":")[0]);
          if (chapter < 1 || chapter > book.chapters) {
            rejected++;
            break;
          }
          const text = (op.text ?? "").trim().slice(0, 1000);
          const key = keys.userNotes(userId, Number(op.book));
          if (text) await kv.hset(key, { [op.ref]: text });
          else await kv.hdel(key, op.ref);
          applied++;
          break;
        }
        default:
          rejected++;
      }
    } catch {
      rejected++;
    }
  }

  // hand back the authoritative state so the device can reconcile in one trip
  const [rawBookmarks, rawCollections] = await Promise.all([
    kv.hgetall(keys.userBookmarks(userId)),
    kv.hgetall(keys.userCollections(userId)),
  ]);
  const bookmarks: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(rawBookmarks ?? {})) {
    try {
      bookmarks[key] = JSON.parse(raw);
    } catch {
      bookmarks[key] = { t: Number(raw) || 0 };
    }
  }
  const collections: Record<string, unknown> = {};
  for (const [id, raw] of Object.entries(rawCollections ?? {})) {
    try {
      collections[id] = JSON.parse(raw);
    } catch {
      // corrupted entry — skip
    }
  }

  return NextResponse.json({ applied, rejected, bookmarks, collections });
}
