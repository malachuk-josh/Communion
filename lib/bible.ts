// Scripture text is served by the getBible v2 API (public domain translations),
// proxied and cached through /api/bible to keep a single stable contract here.

export interface Translation {
  id: string; // getBible abbreviation
  name: string;
  abbrev: string;
  lang: "en" | "es";
}

export const TRANSLATIONS: Translation[] = [
  { id: "kjv", name: "King James Version", abbrev: "KJV", lang: "en" },
  { id: "asv", name: "American Standard Version", abbrev: "ASV", lang: "en" },
  { id: "web", name: "World English Bible", abbrev: "WEB", lang: "en" },
  { id: "valera", name: "Reina Valera 1909", abbrev: "RV1909", lang: "es" },
];

export const DEFAULT_TRANSLATION = "kjv";

export function isTranslation(id: string): boolean {
  return TRANSLATIONS.some((t) => t.id === id);
}

// Study-mode sources (not shown in the translation dropdown):
// Hebrew OT, Greek NT, and Young's Literal Translation for the
// direct-English line. All share KJV-aligned book numbering.
export const STUDY_IDS = ["codex", "textusreceptus", "ylt", "lxx"];

/**
 * The Septuagint numbers the Psalms differently from the Hebrew: it joins
 * Hebrew 9–10 and 114–115, and splits 116 and 147. Between those seams the
 * LXX runs one chapter behind. Returns the LXX chapter for a Hebrew one.
 */
export function lxxPsalm(chapter: number): number {
  if (chapter <= 8) return chapter;
  if (chapter <= 10) return 9;
  if (chapter <= 113) return chapter - 1;
  if (chapter <= 115) return 113;
  if (chapter === 116) return 114;
  if (chapter <= 146) return chapter - 1;
  if (chapter === 147) return 146;
  return chapter;
}

export function originalSourceFor(bookNr: number): string {
  return bookNr <= 39 ? "codex" : "textusreceptus";
}

export interface Book {
  nr: number; // getBible book number, 1–66
  en: string;
  es: string;
  chapters: number;
}

export const BOOKS: Book[] = [
  { nr: 1, en: "Genesis", es: "Génesis", chapters: 50 },
  { nr: 2, en: "Exodus", es: "Éxodo", chapters: 40 },
  { nr: 3, en: "Leviticus", es: "Levítico", chapters: 27 },
  { nr: 4, en: "Numbers", es: "Números", chapters: 36 },
  { nr: 5, en: "Deuteronomy", es: "Deuteronomio", chapters: 34 },
  { nr: 6, en: "Joshua", es: "Josué", chapters: 24 },
  { nr: 7, en: "Judges", es: "Jueces", chapters: 21 },
  { nr: 8, en: "Ruth", es: "Rut", chapters: 4 },
  { nr: 9, en: "1 Samuel", es: "1 Samuel", chapters: 31 },
  { nr: 10, en: "2 Samuel", es: "2 Samuel", chapters: 24 },
  { nr: 11, en: "1 Kings", es: "1 Reyes", chapters: 22 },
  { nr: 12, en: "2 Kings", es: "2 Reyes", chapters: 25 },
  { nr: 13, en: "1 Chronicles", es: "1 Crónicas", chapters: 29 },
  { nr: 14, en: "2 Chronicles", es: "2 Crónicas", chapters: 36 },
  { nr: 15, en: "Ezra", es: "Esdras", chapters: 10 },
  { nr: 16, en: "Nehemiah", es: "Nehemías", chapters: 13 },
  { nr: 17, en: "Esther", es: "Ester", chapters: 10 },
  { nr: 18, en: "Job", es: "Job", chapters: 42 },
  { nr: 19, en: "Psalms", es: "Salmos", chapters: 150 },
  { nr: 20, en: "Proverbs", es: "Proverbios", chapters: 31 },
  { nr: 21, en: "Ecclesiastes", es: "Eclesiastés", chapters: 12 },
  { nr: 22, en: "Song of Solomon", es: "Cantares", chapters: 8 },
  { nr: 23, en: "Isaiah", es: "Isaías", chapters: 66 },
  { nr: 24, en: "Jeremiah", es: "Jeremías", chapters: 52 },
  { nr: 25, en: "Lamentations", es: "Lamentaciones", chapters: 5 },
  { nr: 26, en: "Ezekiel", es: "Ezequiel", chapters: 48 },
  { nr: 27, en: "Daniel", es: "Daniel", chapters: 12 },
  { nr: 28, en: "Hosea", es: "Oseas", chapters: 14 },
  { nr: 29, en: "Joel", es: "Joel", chapters: 3 },
  { nr: 30, en: "Amos", es: "Amós", chapters: 9 },
  { nr: 31, en: "Obadiah", es: "Abdías", chapters: 1 },
  { nr: 32, en: "Jonah", es: "Jonás", chapters: 4 },
  { nr: 33, en: "Micah", es: "Miqueas", chapters: 7 },
  { nr: 34, en: "Nahum", es: "Nahúm", chapters: 3 },
  { nr: 35, en: "Habakkuk", es: "Habacuc", chapters: 3 },
  { nr: 36, en: "Zephaniah", es: "Sofonías", chapters: 3 },
  { nr: 37, en: "Haggai", es: "Hageo", chapters: 2 },
  { nr: 38, en: "Zechariah", es: "Zacarías", chapters: 14 },
  { nr: 39, en: "Malachi", es: "Malaquías", chapters: 4 },
  { nr: 40, en: "Matthew", es: "Mateo", chapters: 28 },
  { nr: 41, en: "Mark", es: "Marcos", chapters: 16 },
  { nr: 42, en: "Luke", es: "Lucas", chapters: 24 },
  { nr: 43, en: "John", es: "Juan", chapters: 21 },
  { nr: 44, en: "Acts", es: "Hechos", chapters: 28 },
  { nr: 45, en: "Romans", es: "Romanos", chapters: 16 },
  { nr: 46, en: "1 Corinthians", es: "1 Corintios", chapters: 16 },
  { nr: 47, en: "2 Corinthians", es: "2 Corintios", chapters: 13 },
  { nr: 48, en: "Galatians", es: "Gálatas", chapters: 6 },
  { nr: 49, en: "Ephesians", es: "Efesios", chapters: 6 },
  { nr: 50, en: "Philippians", es: "Filipenses", chapters: 4 },
  { nr: 51, en: "Colossians", es: "Colosenses", chapters: 4 },
  { nr: 52, en: "1 Thessalonians", es: "1 Tesalonicenses", chapters: 5 },
  { nr: 53, en: "2 Thessalonians", es: "2 Tesalonicenses", chapters: 3 },
  { nr: 54, en: "1 Timothy", es: "1 Timoteo", chapters: 6 },
  { nr: 55, en: "2 Timothy", es: "2 Timoteo", chapters: 4 },
  { nr: 56, en: "Titus", es: "Tito", chapters: 3 },
  { nr: 57, en: "Philemon", es: "Filemón", chapters: 1 },
  { nr: 58, en: "Hebrews", es: "Hebreos", chapters: 13 },
  { nr: 59, en: "James", es: "Santiago", chapters: 5 },
  { nr: 60, en: "1 Peter", es: "1 Pedro", chapters: 5 },
  { nr: 61, en: "2 Peter", es: "2 Pedro", chapters: 3 },
  { nr: 62, en: "1 John", es: "1 Juan", chapters: 5 },
  { nr: 63, en: "2 John", es: "2 Juan", chapters: 1 },
  { nr: 64, en: "3 John", es: "3 Juan", chapters: 1 },
  { nr: 65, en: "Jude", es: "Judas", chapters: 1 },
  { nr: 66, en: "Revelation", es: "Apocalipsis", chapters: 22 },
];

export function getBook(nr: number): Book | undefined {
  return BOOKS.find((b) => b.nr === nr);
}

export interface Verse {
  verse: number;
  text: string;
}

export interface ChapterData {
  translation: string;
  bookNr: number;
  chapter: number;
  verses: Verse[];
}
