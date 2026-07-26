"use client";

// The book-and-chapter navigator inside the reader's fold-out panel.
// Testaments open and close; opening a book unfolds its chapters in place,
// and opening a chapter unfolds its verses under it — so finding a passage
// feels like turning to it rather than picking from three dropdowns.

import { Fragment, useEffect, useRef, useState } from "react";
import { BOOKS } from "@/lib/bible";
import { useI18n } from "@/lib/i18n";
import { fetchBook } from "@/lib/scripture";

const LAST_OT_BOOK = 39;

export default function BookNav({
  bookNr,
  chapter,
  translation,
  onChapter,
  onVerse,
}: {
  bookNr: number;
  chapter: number;
  /** which text to count verses from — they differ between translations */
  translation: string;
  /** move the reader to a chapter, leaving the panel open for a verse */
  onChapter: (bookNr: number, chapter: number) => void;
  /** go to one verse, and close */
  onVerse: (bookNr: number, chapter: number, verse: number) => void;
}) {
  const { lang, t } = useI18n();
  const nt = bookNr > LAST_OT_BOOK;
  // open where the reader already is
  const [openTestaments, setOpenTestaments] = useState({ ot: !nt, nt });
  const [openBook, setOpenBook] = useState<number | null>(bookNr);
  const [openChapter, setOpenChapter] = useState<number | null>(null);
  /** verse counts per chapter, by book — filled in as books are opened */
  const [counts, setCounts] = useState<Record<number, Record<number, number>>>(
    {}
  );
  /** books whose text could not be read, so the grid can say so */
  const [noCounts, setNoCounts] = useState<Record<number, boolean>>({});
  const currentRef = useRef<HTMLDivElement>(null);
  const asked = useRef(new Set<string>());

  // Bring the open book a third of the way down the panel, but never scroll
  // past the top — for Genesis that would push the search field out of view.
  useEffect(() => {
    const el = currentRef.current;
    const box = el?.closest<HTMLElement>(".sp-body");
    if (!el || !box) return;
    const delta = el.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTop = Math.max(0, box.scrollTop + delta - box.clientHeight / 3);
    // only on mount: later taps should leave the scroll where the finger put it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * How many verses each chapter of a book has. Nothing ships that as a
   * table, so it is counted from the text itself — one request for the whole
   * book, which is the same file the reader is about to want anyway, and
   * already in hand for the book being read. Offline without it, no verse
   * grid appears and the chapter tap stands on its own.
   */
  const loadCounts = (book: number) => {
    const key = `${translation}/${book}`;
    if (asked.current.has(key)) return;
    asked.current.add(key);
    setNoCounts((prev) => (prev[book] ? { ...prev, [book]: false } : prev));
    fetchBook(translation, book)
      .then((data) => {
        const perChapter: Record<number, number> = {};
        for (const ch of data.chapters) {
          // the last verse number, not the row count: a chapter missing a
          // verse in some edition must not shorten the grid
          perChapter[ch.chapter] = ch.verses.reduce(
            (max, v) => Math.max(max, v.verse),
            0
          );
        }
        setCounts((prev) => ({ ...prev, [book]: perChapter }));
      })
      .catch(() => {
        // not downloaded and no signal. Say so rather than spin, and let it
        // be asked for again the next time the chapter is opened.
        asked.current.delete(key);
        setNoCounts((prev) => ({ ...prev, [book]: true }));
      });
  };

  const pickChapter = (book: number, c: number) => {
    const alreadyOpen = openBook === book && openChapter === c;
    setOpenChapter(alreadyOpen ? null : c);
    if (alreadyOpen) return;
    loadCounts(book);
    // the reader moves now; the panel stays for a verse, or a tap on the
    // scrim, whichever the reader wanted
    onChapter(book, c);
  };

  const verseGrid = (book: number, c: number) => {
    const n = counts[book]?.[c];
    return (
      <div className="bn-verses">
        {n ? (
          Array.from({ length: n }, (_, i) => i + 1).map((v) => (
            <button
              key={v}
              type="button"
              className="bn-v"
              onClick={() => onVerse(book, c, v)}
            >
              {v}
            </button>
          ))
        ) : (
          <span className="bn-v-wait">
            {noCounts[book] ? t("reader.versesOffline") : t("common.loading")}
          </span>
        )}
      </div>
    );
  };

  const testament = (key: "ot" | "nt", label: string, books: typeof BOOKS) => (
    <div key={key}>
      <button
        type="button"
        className="bn-testament"
        aria-expanded={openTestaments[key]}
        onClick={() =>
          setOpenTestaments((open) => ({ ...open, [key]: !open[key] }))
        }
      >
        <span>{label}</span>
        <span className={`bn-caret${openTestaments[key] ? " open" : ""}`}>
          ⌄
        </span>
      </button>
      {openTestaments[key] &&
        books.map((book) => {
          const open = openBook === book.nr;
          const here = book.nr === bookNr;
          return (
            <div key={book.nr} ref={here ? currentRef : undefined}>
              <button
                type="button"
                className={`bn-book${here ? " current" : ""}`}
                aria-expanded={open}
                onClick={() => {
                  setOpenBook(open ? null : book.nr);
                  setOpenChapter(null);
                }}
              >
                <span>{lang === "es" ? book.es : book.en}</span>
                <span className={`bn-caret${open ? " open" : ""}`}>
                  {open ? "⌄" : "›"}
                </span>
              </button>
              {open && (
                <div className="bn-chapters">
                  {Array.from({ length: book.chapters }, (_, i) => i + 1).map(
                    (c) => {
                      const chapterOpen = openChapter === c;
                      return (
                        // a fragment, so the button and the verse row stay
                        // siblings in the same grid — the verses take a full
                        // row of their own directly under the chapter tapped
                        <Fragment key={c}>
                          <button
                            type="button"
                            className={`bn-ch${
                              here && c === chapter ? " current" : ""
                            }${chapterOpen ? " open" : ""}`}
                            onClick={() => pickChapter(book.nr, c)}
                            aria-expanded={chapterOpen}
                            aria-current={
                              here && c === chapter ? "page" : undefined
                            }
                          >
                            {c}
                          </button>
                          {chapterOpen && verseGrid(book.nr, c)}
                        </Fragment>
                      );
                    }
                  )}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );

  return (
    <nav className="book-nav" aria-label={t("reader.books")}>
      <p className="bn-title">{t("reader.books")}</p>
      {testament(
        "ot",
        t("reader.oldTestament"),
        BOOKS.filter((b) => b.nr <= LAST_OT_BOOK)
      )}
      {testament(
        "nt",
        t("reader.newTestament"),
        BOOKS.filter((b) => b.nr > LAST_OT_BOOK)
      )}
    </nav>
  );
}
