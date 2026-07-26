// Reading a chapter of somebody else's translation.
//
// Two publishers, two APIs, two sets of house rules, one shape at the end of
// it — the same {verse, text} rows the static files hand over, so nothing
// above this file has to know which kind of translation it is looking at.
//
// The keys never leave the server. Both APIs authenticate with a bearer-style
// header and neither offers per-origin restriction, so a key in the browser is
// a key anyone can lift and spend this app's daily allowance with.
//
// A chapter at a time, and only ever a chapter. Both licences cap what may be
// held at around five hundred verses — a few chapters of anything — so there
// is deliberately no way to ask this file for a book.

import { usfmCode } from "@/lib/usfm";
import { getBook } from "@/lib/bible";

export interface LicensedChapter {
  verses: { verse: number; text: string }[];
  /**
   * API.Bible requires every read to be reported back to them. The token
   * comes down with the chapter and goes back up from the route; see fums().
   */
  fumsId?: string;
}

/** Whether a licensed translation is configured at all. */
export function licensedKey(id: string): string | undefined {
  if (id === "esv") return process.env.ESV_API_KEY || undefined;
  if (id === "nkjv") return process.env.API_BIBLE_KEY || undefined;
  return undefined;
}

/**
 * Pull verses out of a run of text marked up the way both of these APIs mark
 * it up: a bracketed number, then the verse, until the next bracketed number.
 *
 * Shared because they agree on it, defensive because neither promises it. A
 * chapter that arrives with no markers at all comes back as a single verse 1
 * rather than as nothing — the reader can show that, and a blank page tells
 * nobody anything.
 */
export function parseBracketed(body: string, firstVerse = 1): {
  verse: number;
  text: string;
}[] {
  const out: { verse: number; text: string }[] = [];
  const marker = /\[(\d{1,3})\]/g;
  let match = marker.exec(body);
  if (!match) {
    const whole = clean(body);
    return whole ? [{ verse: firstVerse, text: whole }] : [];
  }
  while (match) {
    const verse = Number(match[1]);
    const from = match.index + match[0].length;
    match = marker.exec(body);
    const text = clean(body.slice(from, match ? match.index : undefined));
    if (text) out.push({ verse, text });
  }
  return out;
}

const clean = (s: string): string =>
  s
    // the ESV marks paragraph breaks with newlines and indents poetry with
    // spaces; the reader sets its own lines, so this is all one run of prose
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

/**
 * Crossway's own API. Free for non-commercial use, 5,000 queries a day, and
 * everything that would make the response prettier is turned off — headings,
 * footnotes, the reference line and the short copyright are all things this
 * app draws itself, and every one of them would otherwise land inside verse 1.
 */
async function fetchEsv(
  key: string,
  bookNr: number,
  chapter: number
): Promise<LicensedChapter> {
  const book = getBook(bookNr);
  if (!book) throw new Error("no such book");
  const query = new URLSearchParams({
    q: `${book.en} ${chapter}`,
    "include-passage-references": "false",
    "include-verse-numbers": "true",
    "include-first-verse-numbers": "true",
    "include-footnotes": "false",
    "include-footnote-body": "false",
    "include-headings": "false",
    "include-short-copyright": "false",
    "include-copyright": "false",
    "include-selahs": "false",
    "indent-poetry": "false",
    "indent-paragraphs": "0",
    "indent-declares": "0",
    "indent-psalm-doxology": "0",
  });
  const res = await fetch(`https://api.esv.org/v3/passage/text/?${query}`, {
    headers: { Authorization: `Token ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`esv ${res.status}`);
  const data = (await res.json()) as { passages?: string[] };
  const body = (data.passages ?? []).join("\n").trim();
  if (!body) throw new Error("esv empty");
  return { verses: parseBracketed(body) };
}

/**
 * API.Bible, which is where the NKJV is reachable. The chapter is addressed
 * by USFM code, and the reply carries a fumsId that has to be reported back —
 * the terms of using it.
 */
async function fetchApiBible(
  key: string,
  bibleId: string,
  bookNr: number,
  chapter: number
): Promise<LicensedChapter> {
  const code = usfmCode(bookNr);
  if (!code) throw new Error("no such book");
  const query = new URLSearchParams({
    "content-type": "text",
    "include-verse-numbers": "true",
    "include-chapter-numbers": "false",
    "include-notes": "false",
    "include-titles": "false",
    "include-verse-spans": "false",
  });
  const res = await fetch(
    `https://rest.api.bible/v1/bibles/${bibleId}/chapters/${code}.${chapter}?${query}`,
    { headers: { "api-key": key }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`api.bible ${res.status}`);
  const data = (await res.json()) as {
    data?: { content?: string };
    meta?: { fumsId?: string };
  };
  const body = (data.data?.content ?? "").trim();
  if (!body) throw new Error("api.bible empty");
  return { verses: parseBracketed(body), fumsId: data.meta?.fumsId };
}

/** One chapter of a licensed translation, or a throw. */
export function fetchLicensed(
  id: string,
  key: string,
  bookNr: number,
  chapter: number
): Promise<LicensedChapter> {
  if (id === "esv") return fetchEsv(key, bookNr, chapter);
  if (id === "nkjv") {
    const bibleId = process.env.API_BIBLE_NKJV_ID;
    if (!bibleId) return Promise.reject(new Error("no NKJV bible id"));
    return fetchApiBible(key, bibleId, bookNr, chapter);
  }
  return Promise.reject(new Error("not a licensed translation"));
}

/**
 * Tell API.Bible the chapter was read.
 *
 * Their fair-use system expects this, and their own answer is a script that
 * runs in the browser and reports a device id with it. Reporting from here
 * instead keeps a third-party script off the page and the reader's device out
 * of it: what goes back is that a chapter was served, which is what the terms
 * are actually about. Failures are swallowed — a reader who has already been
 * shown the text should not see an error because a tally did not send.
 */
export async function reportFums(fumsId: string): Promise<void> {
  try {
    await fetch(
      `https://fums.api.bible/f3/${encodeURIComponent(fumsId)}?dur=0&t=${Date.now()}`,
      { method: "GET", cache: "no-store" }
    );
  } catch {
    // counted or not, the chapter has been read
  }
}
