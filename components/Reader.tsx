"use client";

import { useEffect, useState } from "react";
import {
  BOOKS,
  DEFAULT_TRANSLATION,
  TRANSLATIONS,
  getBook,
  type ChapterData,
} from "@/lib/bible";
import { useI18n } from "@/lib/i18n";

const DEFAULT_BOOK = 43; // John

export default function Reader() {
  const { lang, t } = useI18n();
  const [translation, setTranslation] = useState(DEFAULT_TRANSLATION);
  const [bookNr, setBookNr] = useState(DEFAULT_BOOK);
  const [chapter, setChapter] = useState(1);
  const [data, setData] = useState<ChapterData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  // restore last reading position
  useEffect(() => {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem("communion.reading") ?? "null"
      ) as { translation: string; bookNr: number; chapter: number } | null;
      if (saved && getBook(saved.bookNr)) {
        if (TRANSLATIONS.some((tr) => tr.id === saved.translation)) {
          setTranslation(saved.translation);
        }
        setBookNr(saved.bookNr);
        setChapter(saved.chapter);
      }
    } catch {
      // corrupted storage — start fresh at the default passage
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetch(`/api/bible/${translation}/${bookNr}/${chapter}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("bad response");
        return res.json();
      })
      .then((json: ChapterData) => {
        setData(json);
        setLoading(false);
        window.localStorage.setItem(
          "communion.reading",
          JSON.stringify({ translation, bookNr, chapter })
        );
        window.scrollTo({ top: 0 });
      })
      .catch((err: unknown) => {
        if ((err as Error).name !== "AbortError") {
          setError(true);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [translation, bookNr, chapter]);

  const book = getBook(bookNr)!;
  const bookName = lang === "es" ? book.es : book.en;

  const go = (delta: number) => {
    const next = chapter + delta;
    if (next >= 1 && next <= book.chapters) {
      setChapter(next);
    } else if (next < 1 && bookNr > 1) {
      const prevBook = getBook(bookNr - 1)!;
      setBookNr(prevBook.nr);
      setChapter(prevBook.chapters);
    } else if (next > book.chapters && bookNr < 66) {
      setBookNr(bookNr + 1);
      setChapter(1);
    }
  };

  return (
    <div>
      <div className="reader-controls">
        <label className="field">
          <span>{t("reader.book")}</span>
          <select
            value={bookNr}
            onChange={(e) => {
              setBookNr(Number(e.target.value));
              setChapter(1);
            }}
          >
            {BOOKS.map((b) => (
              <option key={b.nr} value={b.nr}>
                {lang === "es" ? b.es : b.en}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("reader.chapter")}</span>
          <select
            value={chapter}
            onChange={(e) => setChapter(Number(e.target.value))}
          >
            {Array.from({ length: book.chapters }, (_, i) => i + 1).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("reader.translation")}</span>
          <select
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
          >
            {TRANSLATIONS.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.abbrev} — {tr.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <article className="glass card scripture">
        <h2>
          {bookName} {chapter}
        </h2>
        {loading ? (
          <p className="skeleton">{t("reader.loading")}</p>
        ) : error || !data ? (
          <p className="error-text">{t("reader.error")}</p>
        ) : (
          <p>
            {data.verses.map((v) => (
              <span key={v.verse}>
                <sup className="verse-num">{v.verse}</sup>
                {v.text}{" "}
              </span>
            ))}
          </p>
        )}
      </article>

      <div className="pager">
        <button
          className="btn"
          onClick={() => go(-1)}
          disabled={bookNr === 1 && chapter === 1}
        >
          ← {t("reader.prev")}
        </button>
        <button
          className="btn"
          onClick={() => go(1)}
          disabled={bookNr === 66 && chapter === book.chapters}
        >
          {t("reader.next")} →
        </button>
      </div>
    </div>
  );
}
