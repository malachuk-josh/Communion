import { NextResponse } from "next/server";
import { isTranslation } from "@/lib/bible";

interface GBVerse {
  chapter: number;
  verse: number;
  text: string;
}

interface GBBook {
  nr: number;
  name: string;
  chapters: { chapter: number; verses: GBVerse[] }[];
}

// Whole-translation JSON is ~9MB — far over Next's data-cache entry limit,
// so we keep parsed translations in module scope. Warm serverless instances
// reuse it; a cold start pays one fetch (~2s) on its first search.
const cache = new Map<string, GBBook[]>();

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

async function loadTranslation(id: string): Promise<GBBook[]> {
  const hit = cache.get(id);
  if (hit) return hit;
  const res = await fetch(`https://api.getbible.net/v2/${id}.json`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const data = (await res.json()) as { books: GBBook[] };
  cache.set(id, data.books);
  return data.books;
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

    for (const book of books) {
      for (const chapter of book.chapters) {
        for (const verse of chapter.verses) {
          if (normalize(verse.text).includes(needle)) {
            total++;
            if (results.length < MAX_RESULTS) {
              results.push({
                bookNr: book.nr,
                chapter: chapter.chapter,
                verse: verse.verse,
                text: verse.text.trim(),
              });
            }
          }
        }
      }
    }

    return NextResponse.json({ results, total });
  } catch {
    return NextResponse.json(
      { error: "Scripture source unavailable" },
      { status: 502 }
    );
  }
}
