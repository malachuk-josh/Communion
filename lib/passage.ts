import { BOOKS } from "@/lib/bible";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Parse a free-text passage reference like "John 3", "Juan 3", or
 * "1 Corinthians 11:23" into a reader location. Book names match in
 * English or Spanish, accent-insensitively. Verse suffixes are ignored.
 */
export function parsePassage(
  text: string | undefined
): { bookNr: number; chapter: number; verse?: number } | null {
  if (!text) return null;
  const match = normalize(text).match(
    /^(.+?)\s+(\d{1,3})(?::(\d{1,3}))?(?:[-–]\d.*)?$/
  );
  if (!match) return null;
  const name = match[1];
  const chapter = Number(match[2]);
  const verse = match[3] ? Number(match[3]) : undefined;
  const book = BOOKS.find(
    (b) => normalize(b.en) === name || normalize(b.es) === name
  );
  if (!book || chapter < 1 || chapter > book.chapters) return null;
  return { bookNr: book.nr, chapter, ...(verse ? { verse } : {}) };
}
