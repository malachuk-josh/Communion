import { NextResponse } from "next/server";
import { STUDY_IDS, getBook, isTranslation } from "@/lib/bible";

const GETBIBLE_BASE = "https://api.getbible.net/v2";

interface GetBibleVerse {
  verse: number;
  text: string;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ translation: string; book: string; chapter: string }> }
) {
  const { translation, book, chapter } = await params;
  const bookNr = Number(book);
  const chapterNr = Number(chapter);
  const bookMeta = getBook(bookNr);

  if (
    (!isTranslation(translation) && !STUDY_IDS.includes(translation)) ||
    !bookMeta ||
    !Number.isInteger(chapterNr) ||
    chapterNr < 1 ||
    chapterNr > bookMeta.chapters
  ) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      `${GETBIBLE_BASE}/${translation}/${bookNr}/${chapterNr}.json`,
      { next: { revalidate: 60 * 60 * 24 * 30 } } // scripture doesn't change
    );
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    const data = (await upstream.json()) as { verses: GetBibleVerse[] };

    return NextResponse.json(
      {
        translation,
        bookNr,
        chapter: chapterNr,
        verses: data.verses.map((v) => ({ verse: v.verse, text: v.text.trim() })),
      },
      {
        headers: {
          "cache-control": "public, s-maxage=2592000, stale-while-revalidate=86400",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Scripture source unavailable" },
      { status: 502 }
    );
  }
}
