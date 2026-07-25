"use client";

// The book-and-chapter navigator inside the reader's fold-out panel.
// Testaments open and close; opening a book unfolds its chapters in place,
// so finding a passage feels like turning to it rather than picking from
// two dropdowns.

import { useEffect, useRef, useState } from "react";
import { BOOKS } from "@/lib/bible";
import { useI18n } from "@/lib/i18n";

const LAST_OT_BOOK = 39;

export default function BookNav({
  bookNr,
  chapter,
  onPick,
}: {
  bookNr: number;
  chapter: number;
  onPick: (bookNr: number, chapter: number) => void;
}) {
  const { lang, t } = useI18n();
  const nt = bookNr > LAST_OT_BOOK;
  // open where the reader already is
  const [openTestaments, setOpenTestaments] = useState({ ot: !nt, nt });
  const [openBook, setOpenBook] = useState<number | null>(bookNr);
  const currentRef = useRef<HTMLDivElement>(null);

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
                onClick={() => setOpenBook(open ? null : book.nr)}
              >
                <span>{lang === "es" ? book.es : book.en}</span>
                <span className={`bn-caret${open ? " open" : ""}`}>
                  {open ? "⌄" : "›"}
                </span>
              </button>
              {open && (
                <div className="bn-chapters">
                  {Array.from({ length: book.chapters }, (_, i) => i + 1).map(
                    (c) => (
                      <button
                        key={c}
                        type="button"
                        className={`bn-ch${
                          here && c === chapter ? " current" : ""
                        }`}
                        onClick={() => onPick(book.nr, c)}
                        aria-current={here && c === chapter ? "page" : undefined}
                      >
                        {c}
                      </button>
                    )
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
