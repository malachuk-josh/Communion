"use client";

import { useEffect, useState } from "react";
import {
  BOOKS,
  DEFAULT_TRANSLATION,
  TRANSLATIONS,
  getBook,
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

interface LexEntry {
  lemma: string;
  translit: string;
  pron: string;
  derivation: string;
  def: string;
  kjv: string;
  /** STEPBible grammar code, e.g. "G:N-F" (Greek noun, feminine) */
  gram?: string;
}

interface BmEntry {
  t: number;
  l?: string;
  c?: string;
}

interface BmCollection {
  name: string;
  share?: string;
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
  // tap-a-word originals: tokenized KJV with Strong's numbers per word
  const [strongsTokens, setStrongsTokens] = useState<Record<
    string,
    [string, string[] | null][]
  > | null>(null);
  const [lexHeb, setLexHeb] = useState<Record<string, LexEntry> | null>(null);
  const [lexGrk, setLexGrk] = useState<Record<string, LexEntry> | null>(null);
  const [lexCounts, setLexCounts] = useState<Record<string, number> | null>(
    null
  );
  const [wordSel, setWordSel] = useState<{
    text: string;
    nums: string[];
    verse: number;
  } | null>(null);
  const [wordAction, setWordAction] = useState("");
  const [sharePeers, setSharePeers] = useState<
    { userId: string; displayName: string; icon?: string }[] | null
  >(null);
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const [context, setContext] = useState<Record<
    string,
    Record<string, { practical: string; spiritual: string }>
  > | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [highlightVerse, setHighlightVerse] = useState<number | null>(
    initialVerse ?? null
  );
  const [bookmarks, setBookmarks] = useState<Record<string, BmEntry>>({});
  const [collections, setCollections] = useState<
    Record<string, BmCollection>
  >({});
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [newCollName, setNewCollName] = useState("");
  const [editingBm, setEditingBm] = useState<string | null>(null);
  const [bmLabelDraft, setBmLabelDraft] = useState("");
  const [shareHint, setShareHint] = useState("");
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
    api<{
      bookmarks: Record<string, BmEntry>;
      collections: Record<string, BmCollection>;
    }>("/api/bookmarks")
      .then((res) => {
        setBookmarks(res.bookmarks);
        setCollections(res.collections);
      })
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

  // study mode + KJV: tokenized text where every word knows its original
  // Hebrew/Greek word (Strong's numbers), enabling tap-for-translation
  useEffect(() => {
    if (!study || translation !== "kjv") return;
    let cancelled = false;
    setStrongsTokens(null);
    fetch(`/strongs/${bookNr}.json`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((json) => {
        if (!cancelled) setStrongsTokens(json);
      })
      .catch(() => {
        if (!cancelled) setStrongsTokens({});
      });
    return () => {
      cancelled = true;
    };
  }, [study, translation, bookNr]);

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

  const openWord = (text: string, nums: string[], verse: number) => {
    setWordSel({ text, nums, verse });
    setWordAction("");
    setSharePickerOpen(false);
    // load the lexicon for this testament (and counts) on first use
    if (bookNr <= 39 && !lexHeb) {
      fetch("/lexicon/hebrew.json")
        .then((res) => (res.ok ? res.json() : {}))
        .then(setLexHeb)
        .catch(() => setLexHeb({}));
    }
    if (bookNr > 39 && !lexGrk) {
      fetch("/lexicon/greek.json")
        .then((res) => (res.ok ? res.json() : {}))
        .then(setLexGrk)
        .catch(() => setLexGrk({}));
    }
    if (!lexCounts) {
      fetch("/strongs/counts.json")
        .then((res) => (res.ok ? res.json() : {}))
        .then(setLexCounts)
        .catch(() => setLexCounts({}));
    }
  };

  const lexFor = (num: string): LexEntry | undefined =>
    (num.startsWith("H") ? lexHeb : lexGrk)?.[num];

  /** Plain-text rendering of the open word study, for copy/share/note. */
  const wordSummary = (): string => {
    if (!wordSel) return "";
    const ref = `${bookName} ${chapter}:${wordSel.verse}`;
    const parts = [`"${wordSel.text}" — ${ref}`];
    for (const num of wordSel.nums) {
      const entry = lexFor(num);
      if (!entry) continue;
      const gram = entry.gram ? gramLabel(entry.gram) : null;
      parts.push(
        `${entry.lemma} [${entry.translit}] · ${num}${gram ? ` · ${gram}` : ""}`
      );
      if (entry.def) parts.push(entry.def.trim());
    }
    parts.push("— Communion");
    return parts.join("\n");
  };

  const flashWord = (msg: string) => {
    setWordAction(msg);
    setTimeout(() => setWordAction(""), 2200);
  };

  const copyWord = async () => {
    try {
      await navigator.clipboard.writeText(wordSummary());
      flashWord(t("reader.copied"));
    } catch {
      flashWord(t("reader.error"));
    }
  };

  const shareWord = async () => {
    const text = wordSummary();
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // cancelled — fall through to a text message / clipboard
      }
    }
    const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isMobile) {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      window.location.href = isIOS
        ? `sms:&body=${encodeURIComponent(text)}`
        : `sms:?body=${encodeURIComponent(text)}`;
      return;
    }
    void copyWord();
  };

  const saveWordNote = async () => {
    if (!wordSel) return;
    const key = `${chapter}:${wordSel.verse}`;
    const existing = notes[key] ?? "";
    const addition = wordSummary().replace(/\n— Communion$/, "");
    const text = (existing ? `${existing}\n\n${addition}` : addition).slice(
      0,
      1000
    );
    setNotes((prev) => ({ ...prev, [key]: text }));
    try {
      await api(`/api/notes/${bookNr}`, {
        method: "POST",
        body: { ref: key, text },
      });
      flashWord(t("reader.savedToNote"));
    } catch {
      flashWord(t("reader.error"));
    }
  };

  const openSharePicker = () => {
    setSharePickerOpen((v) => !v);
    if (sharePeers === null) {
      api<{ contacts: { userId: string; displayName: string; icon?: string }[] }>(
        "/api/messages"
      )
        .then((res) => setSharePeers(res.contacts))
        .catch(() => setSharePeers([]));
    }
  };

  const sendWordTo = async (peerId: string) => {
    if (!wordSel) return;
    setSharePickerOpen(false);
    try {
      await api(`/api/messages/${peerId}`, {
        method: "POST",
        body: {
          text: `${wordSel.text} — ${bookName} ${chapter}:${wordSel.verse}`,
          attach: {
            b: bookNr,
            c: chapter,
            v: wordSel.verse,
            kind: "word",
            label: wordSummary().replace(/\n— Communion$/, ""),
          },
        },
      });
      flashWord(t("reader.sent"));
    } catch {
      flashWord(t("reader.error"));
    }
  };

  // Human-readable part of speech (+ gender) from a STEPBible grammar code
  // like "G:N-F", "H:V", "N:N--L", "G:P-1", "H:PerP-CS".
  const gramLabel = (code: string): string | null => {
    const [origin, rest] = code.split(":");
    if (!rest) return null;
    const segs = rest.split("-");
    const head = segs[0];
    const out: string[] = [];
    if (head === "N") {
      out.push(t(origin === "N" ? "gram.properNoun" : "gram.noun"));
      const g = segs[1];
      if (g === "M") out.push(t("gram.masculine"));
      else if (g === "F") out.push(t("gram.feminine"));
      else if (g === "N") out.push(t("gram.neuter"));
      else if (g === "M/F") out.push(t("gram.mascFem"));
      const tag = segs[2] ?? "";
      if (tag.includes("P")) out.push(t("gram.person"));
      else if (tag.includes("L")) out.push(t("gram.place"));
      else if (tag.includes("G")) out.push(t("gram.peopleGroup"));
      else if (tag.includes("T")) out.push(t("gram.title"));
    } else if (head === "V") out.push(t("gram.verb"));
    else if (head === "A")
      out.push(segs[1] === "NUI" ? t("gram.numeral") : t("gram.adjective"));
    else if (/^adv/i.test(head)) out.push(t("gram.adverb"));
    else if (/^prep/i.test(head)) out.push(t("gram.preposition"));
    else if (/^conj/i.test(head)) out.push(t("gram.conjunction"));
    else if (/^(prt|part)$/i.test(head)) out.push(t("gram.particle"));
    else if (/^intj/i.test(head)) out.push(t("gram.interjection"));
    else if (/^intg/i.test(head)) out.push(t("gram.interrogative"));
    else if (head === "T") out.push(t("gram.article"));
    else if (head === "COND") out.push(t("gram.conditional"));
    else if (head === "P" || /^perp/i.test(head))
      out.push(t("gram.pronounPersonal"));
    else if (head === "R" || /^rel/i.test(head))
      out.push(t("gram.pronounRelative"));
    else if (head === "D" || /^demp/i.test(head))
      out.push(t("gram.pronounDemonstrative"));
    else if (head === "X") out.push(t("gram.pronounIndefinite"));
    else return null;
    return out.join(" · ");
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
      else next[key] = { t: Date.now() };
      return next;
    });
    api("/api/bookmarks", {
      method: "POST",
      body: { b: bookNr, c: chapter, v: verse },
    }).catch(() => {});
  };

  const updateBookmark = (key: string, patch: { label?: string; coll?: string }) => {
    setBookmarks((prev) => {
      const entry = { ...prev[key] };
      if (patch.label !== undefined) {
        if (patch.label.trim()) entry.l = patch.label.trim();
        else delete entry.l;
      }
      if (patch.coll !== undefined) {
        if (patch.coll) entry.c = patch.coll;
        else delete entry.c;
      }
      return { ...prev, [key]: entry };
    });
    api("/api/bookmarks", { method: "PATCH", body: { key, ...patch } }).catch(
      () => {}
    );
  };

  const createCollection = async () => {
    const name = newCollName.trim();
    if (!name) return;
    setNewCollName("");
    try {
      const res = await api<{ id: string; name: string }>("/api/collections", {
        method: "POST",
        body: { name },
      });
      setCollections((prev) => ({ ...prev, [res.id]: { name: res.name } }));
    } catch {
      // transient — the next open re-syncs
    }
  };

  const deleteCollection = async (id: string) => {
    if (!window.confirm(t("reader.deleteCollectionConfirm"))) return;
    setCollections((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setBookmarks((prev) => {
      const next: Record<string, BmEntry> = {};
      for (const [key, entry] of Object.entries(prev)) {
        next[key] = entry.c === id ? { ...entry, c: undefined } : entry;
      }
      return next;
    });
    api(`/api/collections/${id}`, { method: "DELETE" }).catch(() => {});
  };

  const shareCollection = async (id: string) => {
    try {
      const res = await api<{ url: string }>(`/api/collections/${id}/share`, {
        method: "POST",
      });
      setCollections((prev) => ({
        ...prev,
        [id]: { ...prev[id], share: res.url.split("/").pop() },
      }));
      if (navigator.share) {
        await navigator.share({
          title: collections[id]?.name ?? "Communion",
          url: res.url,
        });
      } else {
        await navigator.clipboard.writeText(res.url);
        setShareHint(id);
        setTimeout(() => setShareHint(""), 2500);
      }
    } catch {
      // share cancelled or clipboard blocked — nothing to clean up
    }
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
  }, [loading, data, highlightVerse, study, xrefs, strongsTokens, notes]);

  // a new chapter closes any open word translation
  useEffect(() => {
    setWordSel(null);
  }, [bookNr, chapter, study, translation]);

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
            <span>{t("reader.bookmarks")}</span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setBookmarksOpen(true)}
            >
              🔖{Object.keys(bookmarks).length > 0 && ` ${Object.keys(bookmarks).length}`}
            </button>
          </div>
        )}
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

      {study && translation !== "kjv" && (
        <p className="notice" style={{ marginBottom: 10 }}>
          {t("reader.strongsKjvOnly")}
        </p>
      )}

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
                    {strongsTokens?.[key]
                      ? strongsTokens[key].map((tok, i) => {
                          if (!tok[1]) return <span key={i}>{tok[0]}</span>;
                          // keep leading spaces/punctuation outside the tap target
                          const m = tok[0].match(/^([\s,;:.!?()'"—–-]*)([\s\S]*)$/)!;
                          if (!m[2]) return <span key={i}>{tok[0]}</span>;
                          const sel =
                            wordSel &&
                            wordSel.text === m[2] &&
                            wordSel.nums.join() === tok[1].join();
                          return (
                            <span key={i}>
                              {m[1]}
                              <button
                                type="button"
                                className={`w${sel ? " sel" : ""}`}
                                onClick={() => openWord(m[2], tok[1]!, v.verse)}
                              >
                                {m[2]}
                              </button>
                            </span>
                          );
                        })
                      : v.text}
                  </p>
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

      {wordSel && (
        <div className="glass lex-sheet" role="dialog" aria-label={wordSel.text}>
          <div className="lex-head">
            <span className="lex-lemma">
              {lexFor(wordSel.nums[0])?.lemma ?? wordSel.text}
            </span>
            {lexCounts?.[wordSel.nums[0]] !== undefined && (
              <span className="lex-count">
                {t("reader.foundVerses", {
                  count: String(lexCounts[wordSel.nums[0]]),
                })}
              </span>
            )}
            <button
              type="button"
              className="lex-close"
              onClick={() => setWordSel(null)}
              aria-label={t("search.close")}
            >
              ✕
            </button>
          </div>
          <div className="lex-body">
            {wordSel.nums.map((num) => {
              const entry = lexFor(num);
              if (!entry) {
                return (
                  <p key={num} className="skeleton">
                    {t("common.loading")}
                  </p>
                );
              }
              return (
                <div key={num} className="lex-entry">
                  {wordSel.nums.length > 1 && (
                    <p className="lex-sub-lemma">{entry.lemma}</p>
                  )}
                  <p className="lex-meta">
                    [{entry.translit}]{entry.pron ? ` · ${entry.pron}` : ""} ·{" "}
                    {num}
                  </p>
                  {entry.gram && gramLabel(entry.gram) && (
                    <p className="lex-gram">{gramLabel(entry.gram)}</p>
                  )}
                  {entry.derivation && (
                    <p className="lex-derivation">{entry.derivation}</p>
                  )}
                  <p className="lex-def">{entry.def}</p>
                  {entry.kjv && (
                    <p className="lex-kjv">
                      <strong>KJV:</strong> {entry.kjv}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="lex-actions">
            <button type="button" className="btn btn-sm" onClick={copyWord}>
              📋 {t("reader.copy")}
            </button>
            <button type="button" className="btn btn-sm" onClick={shareWord}>
              📤 {t("discover.share")}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={openSharePicker}
              aria-pressed={sharePickerOpen}
            >
              💬 {t("reader.sendToFellowship")}
            </button>
            <button type="button" className="btn btn-sm" onClick={saveWordNote}>
              📝 {t("reader.saveToNote")}
            </button>
          </div>
          {wordAction && <p className="email-sent">✓ {wordAction}</p>}
          {sharePickerOpen && (
            <div className="lex-peers">
              {sharePeers === null ? (
                <p className="skeleton">{t("common.loading")}</p>
              ) : sharePeers.length === 0 ? (
                <p className="cal-hint">{t("messages.noContacts")}</p>
              ) : (
                <div className="chips">
                  {sharePeers.map((p) => (
                    <button
                      key={p.userId}
                      type="button"
                      className="chip"
                      onClick={() => sendWordTo(p.userId)}
                    >
                      {p.icon && <span className="chip-icon">{p.icon}</span>}
                      {p.displayName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
            <div className="coll-new">
              <input
                value={newCollName}
                onChange={(e) => setNewCollName(e.target.value)}
                placeholder={t("reader.newCollection")}
                maxLength={80}
                onKeyDown={(e) => e.key === "Enter" && createCollection()}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={createCollection}
                disabled={!newCollName.trim()}
              >
                ＋
              </button>
            </div>
            {Object.keys(bookmarks).length === 0 ? (
              <p className="notice">{t("reader.bookmarksEmpty")}</p>
            ) : (
              <div className="bookmark-list">
                {[
                  ...Object.entries(collections).map(([id, coll]) => ({
                    id,
                    name: coll.name,
                  })),
                  { id: "", name: t("reader.unsorted") },
                ].map((group) => {
                  const rows = Object.entries(bookmarks)
                    .filter(([, e]) => (e.c ?? "") === group.id)
                    .sort((a, b) => b[1].t - a[1].t);
                  if (group.id === "" && rows.length === 0) return null;
                  return (
                    <div key={group.id || "unsorted"} className="coll-group">
                      <div className="coll-head">
                        <strong>
                          {group.id ? "📚" : "🔖"} {group.name}
                        </strong>
                        <span className="coll-tools">
                          {group.id && (
                            <>
                              <button
                                type="button"
                                className="rsvp-btn"
                                onClick={() => shareCollection(group.id)}
                              >
                                {shareHint === group.id
                                  ? `✓ ${t("reader.shareCopied")}`
                                  : `📤 ${t("reader.shareCollection")}`}
                              </button>
                              <button
                                type="button"
                                className="chip-remove"
                                aria-label={t("reader.deleteCollection")}
                                title={t("reader.deleteCollection")}
                                onClick={() => deleteCollection(group.id)}
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </span>
                      </div>
                      {rows.length === 0 ? (
                        <p className="cal-hint">{t("reader.collEmpty")}</p>
                      ) : (
                        rows.map(([key, entry]) => {
                          const [b, c, v] = key.split(":").map(Number);
                          return (
                            <div key={key} className="bookmark-row">
                              <button
                                type="button"
                                className="bookmark-jump"
                                onClick={() => jumpToBookmark(key)}
                              >
                                📖 {bookNameOf(b)} {c}:{v}
                                {entry.l && (
                                  <span className="bm-label">{entry.l}</span>
                                )}
                              </button>
                              <button
                                type="button"
                                className="rsvp-btn"
                                aria-label={t("reader.editLabel")}
                                title={t("reader.editLabel")}
                                onClick={() => {
                                  setEditingBm(editingBm === key ? null : key);
                                  setBmLabelDraft(entry.l ?? "");
                                }}
                              >
                                ✎
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
                              {editingBm === key && (
                                <div className="bm-edit">
                                  <input
                                    value={bmLabelDraft}
                                    onChange={(e) =>
                                      setBmLabelDraft(e.target.value)
                                    }
                                    placeholder={t("reader.labelPlaceholder")}
                                    maxLength={120}
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        updateBookmark(key, {
                                          label: bmLabelDraft,
                                        });
                                        setEditingBm(null);
                                      }
                                    }}
                                  />
                                  <select
                                    value={entry.c ?? ""}
                                    onChange={(e) =>
                                      updateBookmark(key, {
                                        coll: e.target.value,
                                      })
                                    }
                                  >
                                    <option value="">
                                      {t("reader.unsorted")}
                                    </option>
                                    {Object.entries(collections).map(
                                      ([id, coll]) => (
                                        <option key={id} value={id}>
                                          {coll.name}
                                        </option>
                                      )
                                    )}
                                  </select>
                                  <button
                                    type="button"
                                    className="rsvp-btn active"
                                    onClick={() => {
                                      updateBookmark(key, {
                                        label: bmLabelDraft,
                                      });
                                      setEditingBm(null);
                                    }}
                                  >
                                    {t("common.save")}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
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
