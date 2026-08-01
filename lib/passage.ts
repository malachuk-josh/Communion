import { BOOKS } from "@/lib/bible";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The ways people write the number on a numbered book.
 *
 * "1 Corinthians" is what the list calls it, and almost nobody types that.
 * They write "1st", or "First", or the Roman "I" that most printed Bibles
 * use on the page itself — and in Spanish, "Primera" or "1ra". All of them
 * mean the same book, and none of them matched.
 */
const ORDINALS: Array<[RegExp, string]> = [
  [/^(?:1st|first|i|primera?|1ra|1o)\s+/, "1 "],
  [/^(?:2nd|second|ii|segunda?|2da|2o)\s+/, "2 "],
  [/^(?:3rd|third|iii|tercera?|3ra|3o)\s+/, "3 "],
];

/**
 * Names that are not a prefix of what the list calls the book.
 *
 * Everything else is handled by the prefix rule below — "Gen", "Matt", "1 Cor"
 * are all beginnings of the full name, so they need no table. These are the
 * ones where the common form diverges instead:
 *
 * "Psalm 23" is not a shortening of "Psalms", it is the correct singular, and
 * it is how the reference is written every time a single psalm is cited —
 * which made the commonest citation in the Bible the one the parser refused.
 * "Revelations" is wrong and universal. "Song of Songs" and "Canticles" are
 * the same book under two other names it is genuinely published as.
 */
const ALIASES: Record<string, string> = {
  psalm: "psalms",
  ps: "psalms",
  psa: "psalms",
  salmo: "salmos",
  revelations: "revelation",
  apocalypse: "revelation",
  "song of songs": "song of solomon",
  canticles: "song of solomon",
  cantar: "cantares",
  "cantar de los cantares": "cantares",
  qoheleth: "ecclesiastes",
};

const NAMES = BOOKS.flatMap((b) => [
  { book: b, name: normalize(b.en) },
  { book: b, name: normalize(b.es) },
]);

/**
 * Which book somebody meant.
 *
 * Exact first, then the aliases, then an unambiguous prefix — in that order,
 * so a name that is genuinely a book ("Job") is never taken for the start of
 * a longer one. A prefix matching two books is not a match at all: "Phil"
 * really could be Philippians or Philemon, and guessing would send the reader
 * somewhere confidently wrong, which is worse than telling them it did not
 * recognise the reference.
 */
function findBook(raw: string) {
  let name = raw;
  for (const [pattern, replacement] of ORDINALS) {
    if (pattern.test(name)) {
      name = name.replace(pattern, replacement);
      break;
    }
  }
  name = ALIASES[name] ?? name;

  const exact = NAMES.find((n) => n.name === name);
  if (exact) return exact.book;

  if (name.length < 2) return null;
  const starts = NAMES.filter((n) => n.name.startsWith(name));
  const books = new Set(starts.map((s) => s.book.nr));
  return books.size === 1 ? starts[0].book : null;
}

/**
 * Parse a free-text passage reference like "John 3", "Juan 3", "Psalm 23" or
 * "1 Corinthians 11:23" into a reader location. Book names match in English
 * or Spanish, accent-insensitively, and may be abbreviated as long as the
 * abbreviation can only mean one book. Verse ranges are read as their start.
 */
export function parsePassage(
  text: string | undefined
): { bookNr: number; chapter: number; verse?: number } | null {
  if (!text) return null;
  // brackets and trailing marks are how a reference sits in a sentence, not
  // part of it — "(Romans 8:28)" is a reference somebody pasted, not a miss
  const cleaned = normalize(text)
    .replace(/^[([]+/, "")
    .replace(/[.,;:)\]]+$/, "");
  const match = cleaned.match(/^(.+?)\s+(\d{1,3})(?::(\d{1,3}))?(?:[-–—]\d.*)?$/);
  if (!match) return null;
  const chapter = Number(match[2]);
  const verse = match[3] ? Number(match[3]) : undefined;
  const book = findBook(match[1]);
  if (!book || chapter < 1 || chapter > book.chapters) return null;
  return { bookNr: book.nr, chapter, ...(verse ? { verse } : {}) };
}
