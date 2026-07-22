import Reader from "@/components/Reader";
import { getBook } from "@/lib/bible";

export default async function ReaderPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string; c?: string; v?: string }>;
}) {
  const { b, c, v } = await searchParams;
  const book = getBook(Number(b));
  const chapter = Number(c);
  const verse = Number(v);
  const valid =
    book && Number.isInteger(chapter) && chapter >= 1 && chapter <= book.chapters;
  return (
    <Reader
      initialBook={valid ? book.nr : undefined}
      initialChapter={valid ? chapter : undefined}
      initialVerse={
        valid && Number.isInteger(verse) && verse >= 1 ? verse : undefined
      }
    />
  );
}
