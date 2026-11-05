// The illustrated Bible: a picture for a scene, tied to the verse the scene
// begins on. Written by scripts/build-bible-art.mjs into public/art/bible.json,
// which the reader fetches when pictures are on, and the gallery in Discover
// when it is opened.

import { useEffect, useState } from "react";

export interface BibleArt {
  id: string;
  /** the library's own name for it */
  title: string;
  /** its label: words of the passage, quoted from the King James text */
  q: string;
  /** the chapter and verse the quote is from */
  qc: number;
  qv: number;
  /** "Genesis 22:1-14", as the library gives it */
  ref: string;
  /** where the scene begins: book, chapter, verse */
  b: number;
  c: number;
  v: number;
  /** and where it ends */
  ce: number;
  ve: number;
  /** "passage scene", "parable illustration", … */
  kind: string;
  alt: string;
  /** what the picture interprets or leaves out, where the library says */
  note: string;
  src: string;
  full: string;
  w: number;
  h: number;
}

export interface Story {
  id: string;
  /** the picture shown for the story */
  cover: string;
  /** its pictures in order, each with the part of the story it is in when the story has parts */
  parts: ([string] | [string, string])[];
}

interface Index {
  note: string;
  items: Record<string, Omit<BibleArt, "id">>;
  chapters: Record<string, [string, number][]>;
  stories: Story[];
}

let loading: Promise<Index | null> | null = null;

export function loadBibleArt(): Promise<Index | null> {
  loading ??= fetch("/art/bible.json")
    .then((r) => (r.ok ? (r.json() as Promise<Index>) : null))
    .catch(() => {
      loading = null;
      return null;
    });
  return loading;
}

export const artOf = (index: Index, id: string): BibleArt | null =>
  index.items[id] ? { id, ...index.items[id] } : null;

/** A chapter's pictures, by the verse each begins on. */
export function chapterArt(index: Index | null, bookNr: number, chapter: number): Map<number, BibleArt[]> {
  const at = new Map<number, BibleArt[]>();
  for (const [id, v] of index?.chapters[`${bookNr}:${chapter}`] ?? []) {
    const art = artOf(index!, id);
    if (art) at.set(v, [...(at.get(v) ?? []), art]);
  }
  return at;
}

// ---- pictures in the text: on or off ------------------------------------------

const KEY = "communion.textPictures";
const EVENT = "communion:textPictures";

/** Whether the reader shows the illustrated Bible's pictures in the text. Off until turned on. */
export function readTextPictures(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeTextPictures(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // private mode: it holds for this visit
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: on }));
}

/** The setting, kept in step wherever it is changed. */
export function useTextPictures(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(readTextPictures());
    const hear = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENT, hear);
    return () => window.removeEventListener(EVENT, hear);
  }, []);
  return [on, writeTextPictures];
}

/** The passage a picture shows, named in the reader's language: "Génesis 1:1-5". */
export function passageLabel(a: BibleArt, bookName: (nr: number) => string): string {
  const end = a.ce && a.ce !== a.c ? `${a.ce}:${a.ve}` : a.ve && a.ve !== a.v ? `${a.ve}` : "";
  return `${bookName(a.b)} ${a.c}:${a.v}${end ? `-${end}` : ""}`;
}

/**
 * What a picture is called, and the line under it. In English, the words of
 * the passage it shows as the King James has them, and the verse they are
 * from. In Spanish, where the quote would be English, the passage itself.
 */
export function artLabel(
  a: BibleArt,
  lang: string,
  bookName: (nr: number) => string
): { label: string; sub?: string } {
  if (lang === "en" && a.q) return { label: `“${a.q}”`, sub: `${bookName(a.b)} ${a.qc}:${a.qv}` };
  return { label: passageLabel(a, bookName) };
}
