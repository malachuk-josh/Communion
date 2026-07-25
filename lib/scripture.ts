// Scripture, served as static files: /bible/{translation}/{book}.json holds a
// whole book, verses as [verse, text] pairs keyed by chapter. One request per
// book, cached by the browser and the service worker — reading works offline
// once a book has been seen (or downloaded from the offline screen).

import { STUDY_IDS, isTranslation, type ChapterData, type Verse } from "./bible";

type BookFile = Record<string, [number, string][]>;

// per-session memory cache so chapter-to-chapter movement inside a book
// costs zero requests
const books = new Map<string, Promise<BookFile>>();

function loadBook(translation: string, bookNr: number): Promise<BookFile> {
  const key = `${translation}/${bookNr}`;
  let hit = books.get(key);
  if (!hit) {
    hit = fetch(`/bible/${translation}/${bookNr}.json`).then((res) => {
      if (!res.ok) throw new Error(`no ${key}`);
      return res.json() as Promise<BookFile>;
    });
    // a failed fetch must not poison the cache for the retry
    hit.catch(() => books.delete(key));
    books.set(key, hit);
  }
  return hit;
}

/**
 * A chapter of scripture, in the shape the old /api/bible route returned.
 * Static-first; falls back to the API route for anything not shipped as a
 * static file (the study sources besides the LXX).
 */
export async function fetchChapter(
  translation: string,
  bookNr: number,
  chapter: number
): Promise<ChapterData> {
  if (isTranslation(translation) || translation === "lxx") {
    try {
      const book = await loadBook(translation, bookNr);
      const rows = book[String(chapter)];
      if (rows && rows.length > 0) {
        return {
          translation,
          bookNr,
          chapter,
          verses: rows.map(([verse, text]) => ({ verse, text })),
        };
      }
      // fall through: a chapter the static file genuinely lacks
    } catch {
      // static file unreachable — try the API below
    }
  } else if (!STUDY_IDS.includes(translation)) {
    throw new Error("unknown translation");
  }
  const res = await fetch(`/api/bible/${translation}/${bookNr}/${chapter}`);
  if (!res.ok) throw new Error("chapter unavailable");
  return res.json() as Promise<ChapterData>;
}

export interface LocalSearchResult {
  bookNr: number;
  chapter: number;
  verse: number;
  text: string;
}

/**
 * Search a translation by scanning its static book files — the offline path,
 * used when the search API cannot be reached. Only books already in the
 * HTTP/service-worker cache resolve offline; the rest are skipped quietly.
 */
export async function searchLocal(
  translation: string,
  query: string,
  limit = 50
): Promise<{ results: LocalSearchResult[]; total: number }> {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  const q = normalize(query);
  const results: LocalSearchResult[] = [];
  let total = 0;
  for (let bookNr = 1; bookNr <= 66; bookNr++) {
    let book: BookFile;
    try {
      book = await loadBook(translation, bookNr);
    } catch {
      continue; // not cached and no network — skip
    }
    for (const [ch, rows] of Object.entries(book)) {
      for (const [verse, text] of rows) {
        if (normalize(text).includes(q)) {
          total++;
          if (results.length < limit) {
            results.push({ bookNr, chapter: Number(ch), verse, text });
          }
        }
      }
    }
  }
  return { results, total };
}
