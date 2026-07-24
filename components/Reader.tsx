"use client";

import { useEffect, useState } from "react";
import {
  BOOKS,
  DEFAULT_TRANSLATION,
  TRANSLATIONS,
  getBook,
  originalSourceFor,
  type ChapterData,
} from "@/lib/bible";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import { useReading } from "@/lib/reading";

const DEFAULT_BOOK = 40; // Matthew — the app opens on its founding verse
const DEFAULT_CHAPTER = 18;
const DEFAULT_VERSE = 20;

const SCALE_MIN = 0.85;
const SCALE_MAX = 1.75;
const SCALE_STEP = 0.15;

interface SearchResult {
  bookNr: number;
  chapter: number;
  verse: number;
  text: string;
}

export default function Reader({
  initialBook,
  initialChapter,
  initialVerse,
}: {
  initialBook?: number;
  initialChapter?: number;
  initialVerse?: number;
} = {}) {
  const { lang, t } = useI18n();
  const deepLinked = initialBook !== undefined;
  const [translation, setTranslation] = useState(DEFAULT_TRANSLATION);
  const [bookNr, setBookNr] = useState(initialBook ?? DEFAULT_BOOK);
  const [chapter, setChapter] = useState(initialChapter ?? DEFAULT_CHAPTER);
  const [data, setData] = useState<ChapterData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [study, setStudy] = useState(false);
  const [xrefs, setXrefs] = useState<Record<string, number[][]> | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [originals, setOriginals] = useState(false);
  const [origVerses, setOrigVerses] = useState<Record<number, string> | null>(
    null
  );
  const [litVerses, setLitVerses] = useState<Record<number, string> | null>(
    null
  );
  const [context, setContext] = useState<Record<
    string,
    Record<string, { practical: string; spiritual: string }>
  > | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [highlightVerse, setHighlightVerse] = useState<number | null>(
    initialVerse ?? null
  );
  const [bookmarks, setBookmarks] = useState<Record<string, number>>({});
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [backStack, setBackStack] = useState<
    { b: number; c: number; v: number }[]
  >([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const { setPosition } = useReading();

  // keep the sticky header's passage indicator in sync
  useEffect(() => {
    setPosition({ bookNr, chapter });
  }, [bookNr, chapter, setPosition]);

  // bookmarks sync across devices per user (guests: per browser)
  useEffect(() => {
    api<{ bookmarks: Record<string, number> }>("/api/bookmarks")
      .then((res) => setBookmarks(res.bookmarks))
      .catch(() => {});
  }, []);

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
        // a deep link (?b=&c=) outranks the remembered reading position
        if (!deepLinked) {
          setBookNr(saved.bookNr);
          setChapter(saved.chapter);
        }
      } else if (!deepLinked) {
        // first visit: land on the founding verse, gently highlighted
        setHighlightVerse(DEFAULT_VERSE);
      }
      const savedScale = Number(
        window.localStorage.getItem("communion.textScale")
      );
      if (savedScale >= SCALE_MIN && savedScale <= SCALE_MAX) {
        setScale(savedScale);
      }
      if (window.localStorage.getItem("communion.studyMode") === "1") {
        setStudy(true);
      }
      if (window.localStorage.getItem("communion.originalsMode") === "1") {
        setOriginals(true);
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

  // study mode: load the KJV-keyed cross-reference set for the open book.
  // The same keys apply to every translation sharing KJV versification.
  useEffect(() => {
    if (!study) return;
    let cancelled = false;
    setXrefs(null);
    fetch(`/xref/${bookNr}.json`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((json: Record<string, number[][]>) => {
        if (!cancelled) setXrefs(json);
      })
      .catch(() => {
        if (!cancelled) setXrefs({});
      });
    return () => {
      cancelled = true;
    };
  }, [study, bookNr]);

  // study mode: load this user's notes for the open book
  useEffect(() => {
    if (!study) return;
    let cancelled = false;
    setNotes({});
    setEditingNote(null);
    api<{ notes: Record<string, string> }>(`/api/notes/${bookNr}`)
      .then((res) => {
        if (!cancelled) setNotes(res.notes);
      })
      .catch(() => {
        // signed-out — notes stay local-less until sign-in
      });
    return () => {
      cancelled = true;
    };
  }, [study, bookNr]);

  // translation layer: original language + Young's literal English
  useEffect(() => {
    if (!study || !originals) return;
    let cancelled = false;
    setOrigVerses(null);
    setLitVerses(null);
    const toMap = (json: ChapterData) => {
      const map: Record<number, string> = {};
      for (const v of json.verses) map[v.verse] = v.text;
      return map;
    };
    fetch(`/api/bible/${originalSourceFor(bookNr)}/${bookNr}/${chapter}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json: ChapterData) => {
        if (!cancelled) setOrigVerses(toMap(json));
      })
      .catch(() => {
        if (!cancelled) setOrigVerses({});
      });
    fetch(`/api/bible/ylt/${bookNr}/${chapter}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json: ChapterData) => {
        if (!cancelled) setLitVerses(toMap(json));
      })
      .catch(() => {
        if (!cancelled) setLitVerses({});
      });
    return () => {
      cancelled = true;
    };
  }, [study, originals, bookNr, chapter]);

  // chapter context (practical + spiritual), one static file per book
  useEffect(() => {
    if (!study) return;
    let cancelled = false;
    setContext(null);
    fetch(`/context/${bookNr}.json`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((json) => {
        if (!cancelled) setContext(json);
      })
      .catch(() => {
        if (!cancelled) setContext({});
      });
    return () => {
      cancelled = true;
    };
  }, [study, bookNr]);

  const toggleStudy = () => {
    const next = !study;
    setStudy(next);
    window.localStorage.setItem("communion.studyMode", next ? "1" : "0");
  };

  const toggleOriginals = () => {
    const next = !originals;
    setOriginals(next);
    window.localStorage.setItem("communion.originalsMode", next ? "1" : "0");
  };

  const chapterContext = context?.[String(chapter)]?.[lang === "es" ? "es" : "en"];

  const startNote = (key: string) => {
    setNoteDraft(notes[key] ?? "");
    setEditingNote(key);
  };

  const saveNote = async (key: string) => {
    const text = noteDraft.trim();
    setNotes((prev) => {
      const next = { ...prev };
      if (text) next[key] = text;
      else delete next[key];
      return next;
    });
    setEditingNote(null);
    try {
      await api(`/api/notes/${bookNr}`, {
        method: "POST",
        body: { ref: key, text },
      });
    } catch {
      // offline/unauthenticated — the optimistic note stays for this session
    }
  };

  const jumpToRef = (ref: number[], fromVerse: number) => {
    // remember where we came from so the reader can jump straight back
    setBackStack((prev) =>
      [...prev, { b: bookNr, c: chapter, v: fromVerse }].slice(-10)
    );
    setBookNr(ref[0]);
    setChapter(ref[1]);
    setHighlightVerse(ref[2]);
  };

  const goBack = () => {
    const last = backStack[backStack.length - 1];
    if (!last) return;
    setBackStack((prev) => prev.slice(0, -1));
    setBookNr(last.b);
    setChapter(last.c);
    setHighlightVerse(last.v);
  };

  const toggleBookmark = (verse: number) => {
    const key = `${bookNr}:${chapter}:${verse}`;
    setBookmarks((prev) => {
      const next = { ...prev };
      if (key in next) delete next[key];
      else next[key] = Date.now();
      return next;
    });
    api("/api/bookmarks", {
      method: "POST",
      body: { b: bookNr, c: chapter, v: verse },
    }).catch(() => {});
  };

  const jumpToBookmark = (key: string) => {
    const [b, c, v] = key.split(":").map(Number);
    setBookmarksOpen(false);
    setBackStack([]);
    setBookNr(b);
    setChapter(c);
    setHighlightVerse(v);
  };

  const refChipLabel = (ref: number[]) => {
    const refBook = getBook(ref[0]);
    if (!refBook) return "";
    const name = lang === "es" ? refBook.es : refBook.en;
    return `${name} ${ref[1]}:${ref[2]}${ref[3] ? `–${ref[3]}` : ""}`;
  };

  // After a jump, bring the target verse into view — and keep correcting
  // briefly, because study-mode extras (xref chips, original-language lines,
  // notes) load after the text and push the target further down the page.
  useEffect(() => {
    if (loading || !data || highlightVerse === null) return;
    let attempts = 0;
    const settle = () => {
      const el = document.getElementById(`v-${highlightVerse}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        const drift = Math.abs(
          rect.top + rect.height / 2 - window.innerHeight / 2
        );
        if (drift > 48) {
          el.scrollIntoView({
            behavior: attempts === 0 ? "smooth" : "auto",
            block: "center",
          });
        }
      }
      if (++attempts >= 6) window.clearInterval(id);
    };
    const id = window.setInterval(settle, 400);
    settle();
    // the user taking over scrolling ends the correction loop immediately
    const stop = () => window.clearInterval(id);
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchmove", stop, { passive: true, once: true });
    return () => {
      window.clearInterval(id);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
    };
  }, [loading, data, highlightVerse, study, xrefs, origVerses, litVerses, notes]);

  const book = getBook(bookNr)!;
  const bookName = lang === "es" ? book.es : book.en;
  const bookNameOf = (nr: number) => {
    const b = getBook(nr);
    return b ? (lang === "es" ? b.es : b.en) : "";
  };

  const go = (delta: number) => {
    setHighlightVerse(null);
    setBackStack([]);
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
    setBackStack([]);
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
              setBackStack([]);
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
              setBackStack([]);
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
          <span>{t("reader.study")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={study}
            className={`switch${study ? " on" : ""}`}
            onClick={toggleStudy}
            aria-label={t("reader.study")}
          >
            <span className="switch-knob" />
          </button>
        </div>
        {study && (
          <div className="field zoom-field">
            <span>{t("reader.originals")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={originals}
              className={`switch${originals ? " on" : ""}`}
              onClick={toggleOriginals}
              aria-label={t("reader.originals")}
            >
              <span className="switch-knob" />
            </button>
          </div>
        )}
        <div className="field zoom-field">
          <span>{t("reader.bookmarks")}</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setBookmarksOpen(true)}
          >
            🔖{Object.keys(bookmarks).length > 0 && ` ${Object.keys(bookmarks).length}`}
          </button>
        </div>
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
        className={`glass card scripture${study ? " study" : ""}`}
        style={{ fontSize: `calc(1.12rem * ${scale})` }}
      >
        <h2>
          {bookName} {chapter}
        </h2>
        {loading ? (
          <p className="skeleton">{t("reader.loading")}</p>
        ) : error || !data ? (
          <p className="error-text">{t("reader.error")}</p>
        ) : study ? (
          <div className="study-verses">
            {data.verses.map((v) => {
              const key = `${chapter}:${v.verse}`;
              const refs = xrefs?.[key];
              const note = notes[key];
              return (
                <div
                  key={v.verse}
                  id={`v-${v.verse}`}
                  className={`verse-block${
                    highlightVerse === v.verse ? " verse-highlight" : ""
                  }`}
                >
                  <p>
                    <sup className="verse-num">{v.verse}</sup>
                    {v.text}
                  </p>
                  {originals && origVerses && origVerses[v.verse] && (
                    <p
                      className="orig-line"
                      dir={bookNr <= 39 ? "rtl" : "ltr"}
                      lang={bookNr <= 39 ? "he" : "el"}
                    >
                      {origVerses[v.verse]}
                    </p>
                  )}
                  {originals && litVerses && litVerses[v.verse] && (
                    <p className="lit-line">
                      <span className="lit-label">{t("reader.literalLabel")}</span>{" "}
                      {litVerses[v.verse]}
                    </p>
                  )}
                  <span className="xref-chips">
                    {chapterContext && (
                      <button
                        type="button"
                        className="xref-chip ctx-chip"
                        onClick={() => setContextOpen(true)}
                        aria-label={t("reader.context")}
                        title={t("reader.context")}
                      >
                        📜 {t("reader.context")}
                      </button>
                    )}
                    {refs?.map((ref, i) => (
                      <button
                        key={i}
                        type="button"
                        className="xref-chip"
                        onClick={() => jumpToRef(ref, v.verse)}
                      >
                        {refChipLabel(ref)}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`xref-chip note-chip${
                        bookmarks[`${bookNr}:${chapter}:${v.verse}`]
                          ? " has-note"
                          : ""
                      }`}
                      onClick={() => toggleBookmark(v.verse)}
                      aria-label={t("reader.bookmarkToggle")}
                      title={t("reader.bookmarkToggle")}
                    >
                      🔖
                    </button>
                    <button
                      type="button"
                      className={`xref-chip note-chip${note ? " has-note" : ""}`}
                      onClick={() => startNote(key)}
                      aria-label={t("reader.addNote")}
                      title={t("reader.addNote")}
                    >
                      📝
                    </button>
                  </span>
                  {note && editingNote !== key && (
                    <div
                      className="verse-note"
                      onClick={() => startNote(key)}
                      role="button"
                      tabIndex={0}
                    >
                      {note}
                    </div>
                  )}
                  {editingNote === key && (
                    <div className="note-edit">
                      <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder={t("reader.notePlaceholder")}
                        maxLength={1000}
                        rows={3}
                        autoFocus
                      />
                      <div className="note-actions">
                        <button
                          type="button"
                          className="rsvp-btn"
                          onClick={() => setEditingNote(null)}
                        >
                          {t("session.cancel")}
                        </button>
                        <button
                          type="button"
                          className="rsvp-btn active"
                          onClick={() => saveNote(key)}
                        >
                          {t("common.save")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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

      {backStack.length > 0 && (
        <button type="button" className="glass back-pill" onClick={goBack}>
          ↩{" "}
          {t("reader.backTo", {
            ref: `${bookNameOf(backStack[backStack.length - 1].b)} ${
              backStack[backStack.length - 1].c
            }:${backStack[backStack.length - 1].v}`,
          })}
        </button>
      )}

      {bookmarksOpen && (
        <div className="modal-overlay" onClick={() => setBookmarksOpen(false)}>
          <div className="glass modal" onClick={(e) => e.stopPropagation()}>
            <h2>🔖 {t("reader.bookmarks")}</h2>
            {Object.keys(bookmarks).length === 0 ? (
              <p className="notice">{t("reader.bookmarksEmpty")}</p>
            ) : (
              <div className="bookmark-list">
                {Object.entries(bookmarks)
                  .sort((a, b) => b[1] - a[1])
                  .map(([key]) => {
                    const [b, c, v] = key.split(":").map(Number);
                    return (
                      <div key={key} className="bookmark-row">
                        <button
                          type="button"
                          className="bookmark-jump"
                          onClick={() => jumpToBookmark(key)}
                        >
                          📖 {bookNameOf(b)} {c}:{v}
                        </button>
                        <button
                          type="button"
                          className="chip-remove"
                          aria-label={t("reader.removeBookmark")}
                          title={t("reader.removeBookmark")}
                          onClick={() => {
                            setBookmarks((prev) => {
                              const next = { ...prev };
                              delete next[key];
                              return next;
                            });
                            api("/api/bookmarks", {
                              method: "POST",
                              body: { b, c, v },
                            }).catch(() => {});
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={() => setBookmarksOpen(false)}>
                {t("session.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {contextOpen && chapterContext && (
        <div className="modal-overlay" onClick={() => setContextOpen(false)}>
          <div className="glass modal" onClick={(e) => e.stopPropagation()}>
            <h2>
              📜 {bookName} {chapter} — {t("reader.context")}
            </h2>
            <div className="ctx-section">
              <h3>🏺 {t("reader.ctxPractical")}</h3>
              <p>{chapterContext.practical}</p>
            </div>
            <div className="ctx-section">
              <h3>✨ {t("reader.ctxSpiritual")}</h3>
              <p>{chapterContext.spiritual}</p>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setContextOpen(false)}>
                {t("session.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
