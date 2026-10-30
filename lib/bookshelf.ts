"use client";

// The Bookshelf: books to read beside Scripture, in the Discover tab.
//
// Each book is a folder under public/books/<slug>, written by
// scripts/build-book.mjs from the book's typeset PDF: book.json with the
// contents and the cover, one JSON file per part (the front matter, each
// chapter, the back matter), and the illustrations. They are fetched as they
// are opened, and stored for offline reading when the book is downloaded in
// Settings — the service worker treats /books/ as data, like the Bible.
//
// What is said about a book on the shelf — its blurb, in both languages — is
// here rather than in the book's own files, because the files are the book and
// the blurb is the app talking about it.

import { api } from "@/lib/client";
import { parsePassage } from "@/lib/passage";
import { readLocal, writeLocal } from "@/lib/storage";

export interface ShelfBook {
  slug: string;
  title: string;
  /** which volume of a work in more than one, as its cover names it */
  subtitle?: string;
  author: string;
  /** the language the book is written in; the shelf says so when it differs */
  lang: "en" | "es";
  blurb: { en: string; es: string };
  /** its chapter-a-day plan, in lib/plans */
  plan?: string;
  /** what a day of that plan reads, where it is not a chapter */
  unit?: "book" | "canto";
  /** the book that carries on from this one, offered at its end */
  sequel?: string;
}

export const SHELF: ShelfBook[] = [
  {
    slug: "from-this-world",
    title: "From This World to the Next",
    subtitle: "Part One",
    author: "John Bunyan",
    lang: "en",
    blurb: {
      en: "The Pilgrim’s Progress, retold in modern English: Bunyan’s story scene for scene, with nothing added and nothing taken away. His verses are kept as rhymed verse and his Bible references stand where he placed them. Illustrated.",
      es: "El progreso del peregrino, contado de nuevo en inglés moderno: la historia de Bunyan escena por escena, sin añadir ni quitar nada. Sus versos siguen siendo versos rimados y sus referencias bíblicas están donde él las puso. Ilustrado.",
    },
    plan: "pilgrim21",
    sequel: "from-this-world-part-two",
  },
  {
    slug: "from-this-world-part-two",
    title: "From This World to the Next",
    subtitle: "Part Two: Christiana’s Journey",
    author: "John Bunyan",
    lang: "en",
    blurb: {
      en: "The second part of The Pilgrim’s Progress in modern English. Six years after Christian’s journey, his wife Christiana, their four sons and their neighbor Mercy set out on the same road, with Mr. Great-heart as their guide. Scene for scene, nothing added or removed. Illustrated.",
      es: "La segunda parte de El progreso del peregrino en inglés moderno. Seis años después del viaje de Cristiano, su esposa Cristiana, sus cuatro hijos y su vecina Misericordia emprenden el mismo camino, con el señor Gran-corazón como guía. Escena por escena, sin añadir ni quitar nada. Ilustrado.",
    },
    plan: "pilgrimtwo16",
  },
  {
    slug: "siege-of-mansoul",
    title: "The Siege of Mansoul",
    author: "John Bunyan",
    lang: "en",
    blurb: {
      en: "Bunyan’s Holy War, retold in modern English. The town of Mansoul, built by King Shaddai for his own delight, is taken by the giant Diabolus, besieged and won back by the King’s son Emmanuel, lost again through its own carelessness, and delivered at last. Scene for scene, nothing added or removed. Illustrated.",
      es: "La guerra santa de Bunyan, contada de nuevo en inglés moderno. La ciudad de Mansoul, el alma del hombre, construida por el rey Shaddai para su propio deleite, es tomada por el gigante Diabolus, sitiada y reconquistada por Emanuel, el hijo del rey, perdida otra vez por su propio descuido y, al fin, liberada. Escena por escena, sin añadir ni quitar nada. Ilustrado.",
    },
    plan: "siege23",
  },
  {
    slug: "the-fall",
    title: "The Fall",
    subtitle: "Paradise Lost",
    author: "John Milton",
    lang: "en",
    blurb: {
      en: "Paradise Lost, rendered in modern English verse: Milton’s epic line for line, still in unrhymed blank verse, in his twelve Books, each with his own Argument and brief notes on what a reader today is least likely to know. Nothing added and nothing cut. Illustrated with engravings.",
      es: "El paraíso perdido, vertido en verso inglés moderno: la épica de Milton verso a verso, todavía en verso blanco sin rima, en sus doce libros, cada uno con su propio argumento y breves notas sobre lo que un lector de hoy menos conoce. Sin añadir ni quitar nada. Ilustrado con grabados.",
    },
    plan: "fall12",
    unit: "book",
  },
  {
    slug: "divine-comedy",
    title: "The Divine Comedy",
    subtitle: "Longfellow’s translation",
    author: "Dante Alighieri",
    lang: "en",
    blurb: {
      en: "Dante’s journey through Hell, Purgatory and Paradise, in Henry Wadsworth Longfellow’s translation of 1867, line for line with the Italian. All one hundred cantos, each headed by a summary of what happens in it, with two pictures to every canto.",
      es: "El viaje de Dante por el Infierno, el Purgatorio y el Paraíso, en la traducción inglesa de Henry Wadsworth Longfellow de 1867, verso a verso con el italiano. Los cien cantos, cada uno encabezado por un resumen de lo que ocurre en él, con dos ilustraciones en cada canto.",
    },
    plan: "comedy100",
    unit: "canto",
  },
];

export function shelfBook(slug: string | null | undefined): ShelfBook | undefined {
  return SHELF.find((b) => b.slug === slug);
}

// ---- what the files hold -----------------------------------------------------

export interface BookImage {
  src: string;
  w: number;
  h: number;
  /** what the picture shows, where the book gives it a title */
  alt?: string;
}

export interface ContentsEntry {
  id: string;
  /** "Chapter 1", where the part is a chapter */
  label?: string;
  /** the part of the work it is in — The Divine Comedy's Inferno — whose own
   *  page is the entry titled the same */
  group?: string;
  title: string;
  words: number;
}

/** A part's name standing alone: "Inferno · Canto I", where cantos repeat. */
export function partName(e: { group?: string; title: string }): string {
  return e.group && e.group !== e.title ? `${e.group} · ${e.title}` : e.title;
}

export interface BookIndex {
  slug: string;
  title: string;
  author: string;
  /** "Part One": the heading over the chapters, from the book's own title page */
  part?: string;
  cover: BookImage;
  contents: ContentsEntry[];
}

/**
 * One block of a part. Inline text carries <i> and <b> and nothing else, and
 * Bible references stay in the text in their brackets, as printed.
 *
 * A poem in Books (The Fall) adds three: its engravings where they stand in
 * the verse (`img`), the poet's prose Argument at a Book's head and the notes
 * at its end (a paragraph's `style`), and the notes' own title (`section`).
 */
export type Block =
  | { p: string; drop?: boolean; style?: "argument" | "note" }
  | { v: string[][] }
  | { h: string }
  | { img: BookImage }
  | { section: string }
  | { table: { head: string[]; rows: string[][] } };

export interface BookPart {
  id: string;
  label?: string;
  group?: string;
  title: string;
  image?: BookImage;
  blocks: Block[];
}

export const bookUrl = (slug: string, file: string) => `/books/${slug}/${file}`;

const indexes = new Map<string, Promise<BookIndex>>();

export function fetchBookIndex(slug: string): Promise<BookIndex> {
  let found = indexes.get(slug);
  if (!found) {
    found = fetch(bookUrl(slug, "book.json")).then((res) => {
      if (!res.ok) throw new Error(`book ${slug}: ${res.status}`);
      return res.json() as Promise<BookIndex>;
    });
    // a failure is not remembered, so coming back online can try again
    found.catch(() => indexes.delete(slug));
    indexes.set(slug, found);
  }
  return found;
}

export async function fetchBookPart(slug: string, id: string): Promise<BookPart> {
  const res = await fetch(bookUrl(slug, `${id}.json`));
  if (!res.ok) throw new Error(`book ${slug}/${id}: ${res.status}`);
  return res.json() as Promise<BookPart>;
}

/** Where a part opens: the book's own page, or one of its parts. */
export function bookHref(slug: string, part?: string, from?: string): string {
  const q = new URLSearchParams({ b: slug });
  if (part) q.set("p", part);
  if (from) q.set("from", from);
  return `/bookshelf?${q.toString()}`;
}

// ---- where the reader is ------------------------------------------------------

/**
 * A reader's place in a book: which part, and how far down it, as a fraction
 * of the part's height so a different text size or screen still lands near
 * the same sentence. `ts` decides between this device and the account.
 */
export interface Place {
  part: string;
  at: number;
  ts: number;
}

const placeKey = (slug: string) => `communion.shelf.${slug}`;

export function readPlace(slug: string): Place | null {
  try {
    const raw = readLocal(placeKey(slug));
    if (!raw) return null;
    const place = JSON.parse(raw) as Place;
    return typeof place.part === "string" ? place : null;
  } catch {
    return null;
  }
}

let sendTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Remember the place here at once, and on the account a moment later: a
 * reader scrolling sends one save when they settle, not one per frame.
 */
export function writePlace(slug: string, part: string, at: number): void {
  const place: Place = { part, at: Math.min(1, Math.max(0, at)), ts: Date.now() };
  writeLocal(placeKey(slug), JSON.stringify(place));
  if (sendTimer) clearTimeout(sendTimer);
  sendTimer = setTimeout(() => {
    sendTimer = null;
    void api("/api/bookshelf/place", {
      method: "PUT",
      body: { book: slug, ...place },
    }).catch(() => {
      // offline or signed out: this device still has it, and the next save
      // carries it to the account
    });
  }, 2500);
}

/**
 * The newer of this device's place and the account's, so a reader who moved
 * on on their phone opens on that place on their tablet. The account's copy
 * is kept here once it has won.
 */
export async function syncPlace(slug: string): Promise<Place | null> {
  const local = readPlace(slug);
  try {
    const res = await api<{ place: Place | null }>(
      `/api/bookshelf/place?book=${encodeURIComponent(slug)}`
    );
    const remote = res.place;
    if (remote && (!local || remote.ts > local.ts)) {
      writeLocal(placeKey(slug), JSON.stringify(remote));
      return remote;
    }
  } catch {
    // offline, or no account: what this device knows is the answer
  }
  return local;
}

// ---- Bible references in the text -----------------------------------------------

/**
 * Bunyan's abbreviations that are not a unique beginning of a book's name.
 * "Phil." could be Philippians or Philemon, and he means Philippians; "Jas."
 * is how James was abbreviated for centuries and is no prefix of it.
 */
const BUNYAN: Record<string, string> = {
  phil: "philippians",
  jas: "james",
  cant: "song of solomon",
  eccles: "ecclesiastes",
};

export interface BookRef {
  /** the reference as printed, for the button's text */
  text: string;
  b: number;
  c: number;
  /** a verse, or nothing for a whole chapter ("Rom. 3") */
  v?: number;
  /** last verse of a range in the same chapter */
  ve?: number;
  /** further single verses in the same chapter: "2:11, 17" */
  more?: number[];
}

/** Books of one chapter, where "Jude 14" is a verse and not a chapter. */
const ONE_CHAPTER = new Set([31, 57, 63, 64, 65]);

/**
 * Read one bracket's worth of references — "Isa. 64:6; Luke 14:33" — into
 * pieces. A chapter on its own ("Rom. 3") is the whole chapter; a piece that
 * is only numbers ("16:21", or "25" after "Matt. 13") belongs to the book
 * before it; "2:11, 17" is two verses of one chapter. A piece that cannot be
 * read (a "see vv. 22–26") comes back as text, so it is still printed, just
 * not tappable.
 */
export function readRefs(inside: string): Array<BookRef | string> {
  let lastBook = "";
  return inside.split(/;\s*/).map((raw) => {
    const piece = raw.trim();
    // book, chapter, then a verse, the end of a range and further verses — any
    // of them missing. "Jude 14-15" is a range with no colon at all; the
    // further verses may be a range of their own ("Ps. 2:2, 6–8").
    const named = piece.match(
      /^((?:[1-3]\s)?[A-Za-z][A-Za-z. ]*?)\.?\s+(\d+)(?::(\d+))?(?:[-–](\d+))?((?:,\s*\d+(?:[-–]\d+)?)*)$/
    );
    const bare = named ? null : piece.match(/^(\d+)(?::(\d+))?(?:[-–](\d+))?((?:,\s*\d+(?:[-–]\d+)?)*)$/);
    if (!named && !(bare && lastBook)) return piece;
    const name = named ? named[1].trim().replace(/\.$/, "") : lastBook;
    const [c, v, ve, list] = named ? named.slice(2) : bare!.slice(1);
    if (named) lastBook = name;
    const key = name.toLowerCase().replace(/\./g, "").trim();
    const found = parsePassage(`${BUNYAN[key] ?? name} ${numbersFor(key, c, v)}`);
    if (!found) return piece;
    // "Jude 14", "3 John 5-6": a one-chapter book's numbers are its verses
    if (ONE_CHAPTER.has(found.bookNr) && !v) {
      const end = ve ? Number(ve) : 0;
      return {
        text: piece,
        b: found.bookNr,
        c: 1,
        v: Number(c),
        ...(end > Number(c) ? { ve: end } : {}),
      };
    }
    const first = v ? Number(v) : undefined;
    // a range of whole chapters ("Matt. 5-7") opens at its first chapter
    const last = v && ve ? Number(ve) : undefined;
    const more: number[] = [];
    for (const [, from, to] of list ? list.matchAll(/(\d+)(?:[-–](\d+))?/g) : []) {
      for (let n = Number(from); n <= Number(to ?? from); n++) more.push(n);
    }
    return {
      text: piece,
      b: found.bookNr,
      c: found.chapter,
      ...(first ? { v: first } : {}),
      ...(first && last && last > first ? { ve: last } : {}),
      ...(more.length ? { more } : {}),
    };
  });
}

/**
 * What to hand the passage parser for the number part: "1" for a one-chapter
 * book cited by verse alone, since its "chapter 14" does not exist and the
 * parser would refuse it.
 */
const ONE_CHAPTER_NAMES = new Set(["jude", "obad", "obadiah", "philem", "philemon", "2 john", "3 john"]);

function numbersFor(key: string, c: string, v?: string): string {
  if (!v && ONE_CHAPTER_NAMES.has(key)) return "1";
  return v ? `${c}:${v}` : c;
}
