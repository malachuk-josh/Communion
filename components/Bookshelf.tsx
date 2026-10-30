"use client";

// The Bookshelf, in the Discover tab above the reading plans: two rows of
// covers that scroll sideways, like the verses for the moment above them,
// each opening its book's own page. A book the reader has started says where
// they are on its card, so the shelf is also the way back into it.
//
// The cards carry the title and not the blurb: two rows of them are a shelf
// to choose from, and what a book is about is on its own page, a tap away.

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import {
  SHELF,
  bookHref,
  bookUrl,
  fetchBookIndex,
  partName,
  readPlace,
  type BookIndex,
} from "@/lib/bookshelf";
import { useI18n, type MessageKey } from "@/lib/i18n";

export default function Bookshelf() {
  const { lang, t } = useI18n();
  const [indexes, setIndexes] = useState<Record<string, BookIndex>>({});
  const [places, setPlaces] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    for (const book of SHELF) {
      fetchBookIndex(book.slug)
        .then((index) => {
          if (!live) return;
          setIndexes((all) => ({ ...all, [book.slug]: index }));
          const place = readPlace(book.slug);
          const entry = place && index.contents.find((c) => c.id === place.part);
          if (entry) {
            const n = entry.label?.match(/\d+/)?.[0];
            setPlaces((all) => ({
              ...all,
              [book.slug]: n
                ? t("shelf.atChapter", { n, of: String(index.contents.filter((c) => c.label).length) })
                : partName(entry),
            }));
          }
        })
        .catch(() => {
          // offline with the book not downloaded: its card still shows, with
          // no cover, and opening it says why
        });
    }
    return () => {
      live = false;
    };
  }, [t]);

  return (
    <section className="shelf" aria-labelledby="shelf-title">
      <div className="section-head">
        <h2 id="shelf-title">
          <Icon name="books" /> {t("shelf.title")}
        </h2>
      </div>
      <p className="subtitle plans-lead">{t("shelf.lead")}</p>
      <div className="shelf-row">
        {SHELF.map((book) => {
          const index = indexes[book.slug];
          return (
            <Link key={book.slug} href={bookHref(book.slug)} className="glass card shelf-book">
              <span className="shelf-cover">
                {index ? (
                  <img
                    src={bookUrl(book.slug, index.cover.src)}
                    width={index.cover.w}
                    height={index.cover.h}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className="shelf-cover-blank" />
                )}
              </span>
              <span className="shelf-info">
                <span className="shelf-title">{book.title}</span>
                {book.subtitle && <span className="shelf-sub">{book.subtitle}</span>}
                <span className="shelf-author">{book.author}</span>
                {lang !== book.lang && (
                  <span className="bk-lang">{t(`shelf.in.${book.lang}` as MessageKey)}</span>
                )}
                <span className="shelf-go">
                  {places[book.slug] ? (
                    <>
                      <Icon name="book" /> {t("shelf.continue")} · {places[book.slug]}
                    </>
                  ) : (
                    <>
                      <Icon name="book" /> {t("shelf.open")}
                    </>
                  )}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
