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

const SCALE_MIN = 0.85;
const SCALE_MAX = 1.75;
const SCALE_STEP = 0.15;

interface SearchResult {
  bookNr: number;
  chapter: number;
  verse: number;
  text: string;
}

export default function Reader() {
  const { lang, t } = useI18n();
  const [translation, setTranslation] = useState(DEFAULT_TRANSLATION);
  const [bookNr, setBookNr] = useState(DEFAULT_BOOK);
  const [chapter, setChapter] = useState(1);
  const [data, setData] = useState<ChapterData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [highlightVerse, setHighlightVerse] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searching, setSearching] = useState(false);

  // restore last reading position and text size
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
      const savedScale = Number(
        window.localStorage.getItem("communion.textScale")
      );
      if (savedScale >= SCALE_MIN && savedScale <= SCALE_MAX) {
        setScale(savedScale);
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

  // after a search jump, bring the target verse into view
  useEffect(() => {
    if (!loading && data && highlightVerse !== null) {
      const el = document.getElementById(`v-${highlightVerse}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [loading, data, highlightVerse]);

  const book = getBook(bookNr)!;
  const bookName = lang === "es" ? book.es : book.en;
  const bookNameOf = (nr: number) => {
    const b = getBook(nr);
    return b ? (lang === "es" ? b.es : b.en) : "";
  };

  const go = (delta: number) => {
    setHighlightVerse(null);
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

  const zoom = (delta: number) => {
    const next = Math.round((scale + delta) * 100) / 100;
    if (next < SCALE_MIN || next > SCALE_MAX) return;
    setScale(next);
    window.localStorage.setItem("communion.textScale", String(next));
  };

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 3 || searching) return;
    setSearching(true);
    setResults([]);
    setSearchTotal(0);
    try {
      const res = await fetch(
        `/api/search?t=${translation}&q=${encodeURIComponent(q)}`
      );
      if (!res.ok) throw new Error("search failed");
      const json = (await res.json()) as {
        results: SearchResult[];
        total: number;
      };
      setResults(json.results);
      setSearchTotal(json.total);
    } catch {
      setResults([]);
      setSearchTotal(0);
    } finally {
      setSearching(false);
    }
  };

  const jumpTo = (r: SearchResult) => {
    setBookNr(r.bookNr);
    setChapter(r.chapter);
    setHighlightVerse(r.verse);
    setResults(null);
  };

  const highlight = (text: string) => {
    const q = query.trim();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark>{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div>
      <form className="glass search-bar" onSubmit={runSearch}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search.placeholder")}
          maxLength={60}
        />
        <button
          className="btn btn-sm"
          type="submit"
          disabled={query.trim().length < 3 || searching}
        >
          🔍 {t("search.button")}
        </button>
      </form>

      {results !== null && (
        <div className="search-results">
          <div className="search-results-head">
            <span>
              {searching
                ? t("search.searching")
                : searchTotal === 0
                  ? t("search.none")
                  : t("search.results", { count: String(searchTotal) }) +
                    (searchTotal > results.length
                      ? ` — ${t("search.limited", { count: String(results.length) })}`
                      : "")}
            </span>
            <button
              type="button"
              className="rsvp-btn"
              onClick={() => setResults(null)}
              aria-label={t("search.close")}
            >
              ✕
            </button>
          </div>
          {results.map((r) => (
            <button
              key={`${r.bookNr}-${r.chapter}-${r.verse}`}
              type="button"
              className="glass search-result"
              onClick={() => jumpTo(r)}
            >
              <span className="ref">
                {bookNameOf(r.bookNr)} {r.chapter}:{r.verse}
              </span>
              <p>{highlight(r.text)}</p>
            </button>
          ))}
        </div>
      )}

      <div className="reader-controls">
        <label className="field">
          <span>{t("reader.book")}</span>
          <select
            value={bookNr}
            onChange={(e) => {
              setHighlightVerse(null);
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
            onChange={(e) => {
              setHighlightVerse(null);
              setChapter(Number(e.target.value));
            }}
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
        <div className="field zoom-field">
          <span>{t("reader.textSize")}</span>
          <div className="zoom-group">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => zoom(-SCALE_STEP)}
              disabled={scale - SCALE_STEP < SCALE_MIN}
              aria-label={t("reader.smaller")}
            >
              A−
            </button>
            <span className="zoom-value">{Math.round(scale * 100)}%</span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => zoom(SCALE_STEP)}
              disabled={scale + SCALE_STEP > SCALE_MAX}
              aria-label={t("reader.larger")}
            >
              A+
            </button>
          </div>
        </div>
      </div>

      <article
        className="glass card scripture"
        style={{ fontSize: `calc(1.12rem * ${scale})` }}
      >
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
              <span
                key={v.verse}
                id={`v-${v.verse}`}
                className={
                  highlightVerse === v.verse ? "verse-highlight" : undefined
                }
              >
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
