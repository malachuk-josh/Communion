import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { isTranslation } from "@/lib/bible";

/** A book file: chapter number → [verse, text] pairs. */
type BookFile = Record<string, [number, string][]>;

// Whole translations are read from the static files this app ships
// (public/bible/<id>/<book>.json) rather than fetched from an upstream API,
// so search keeps working when that API doesn't. Parsed books stay in module
// scope; a warm instance searches without touching disk again.
const cache = new Map<string, BookFile[]>();

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

async function loadTranslation(id: string): Promise<BookFile[]> {
  const hit = cache.get(id);
  if (hit) return hit;
  const dir = path.join(process.cwd(), "public", "bible", id);
  const books = await Promise.all(
    Array.from({ length: 66 }, async (_, i) => {
      try {
        return JSON.parse(await readFile(path.join(dir, `${i + 1}.json`), "utf8")) as BookFile;
      } catch {
        return {} as BookFile; // a missing book must not fail the whole search
      }
    })
  );
  if (books.every((b) => Object.keys(b).length === 0)) {
    throw new Error(`no scripture files for ${id}`);
  }
  cache.set(id, books);
  return books;
}

const MAX_RESULTS = 50;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const translation = searchParams.get("t") ?? "";
  const query = (searchParams.get("q") ?? "").trim();

  if (!isTranslation(translation) || normalize(query).length < 3) {
    return NextResponse.json({ error: "Invalid search" }, { status: 400 });
  }

  try {
    const books = await loadTranslation(translation);
    const needle = normalize(query);
    const results: {
      bookNr: number;
      chapter: number;
      verse: number;
      text: string;
    }[] = [];
    let total = 0;

    books.forEach((book, i) => {
      const bookNr = i + 1;
      for (const [chapter, rows] of Object.entries(book)) {
        for (const [verse, text] of rows) {
          if (normalize(text).includes(needle)) {
            total++;
            if (results.length < MAX_RESULTS) {
              results.push({ bookNr, chapter: Number(chapter), verse, text });
            }
          }
        }
      }
    });

    return NextResponse.json({ results, total });
  } catch {
    return NextResponse.json(
      { error: "Scripture source unavailable" },
      { status: 502 }
    );
  }
}
