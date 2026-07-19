import Reader from "@/components/Reader";
import { getBook } from "@/lib/bible";

export default async function ReaderPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string; c?: string }>;
}) {
  const { b, c } = await searchParams;
  const book = getBook(Number(b));
  const chapter = Number(c);
  const valid =
    book && Number.isInteger(chapter) && chapter >= 1 && chapter <= book.chapters;
  return (
    <Reader
      initialBook={valid ? book.nr : undefined}
      initialChapter={valid ? chapter : undefined}
    />
  );
}
