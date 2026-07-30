"use client";

// A wall of verses, hung by people.
//
// A Gathering's wall opens shut, and that is deliberate: its job is to say at
// a glance what a room is built on, and six references read in two seconds do
// that where six verses in full are a page nobody scrolls. A reader's own wall
// opens read, because it is not a glance at somebody else's room — it is the
// handful of verses they chose to keep in front of themselves, and putting
// them behind a tap makes a filing cabinet of what was meant to be a wall.
// Either way the text is already there, fetched when the wall was, so opening
// and closing costs nothing.
//
// An open verse can also be double-tapped to go and read it in context. The
// book button beside the reference does the same thing and is the discoverable
// way; this is for the reader who is already looking at the words.

import Link from "next/link";
import Icon from "@/components/Icon";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_TRANSLATION, getBook } from "@/lib/bible";
import { bmRefLabel, bmVerses, parseBmKey, type BmRef } from "@/lib/bookmarkKey";
import { fetchVerses, verseKey } from "@/lib/scripture";
import { useI18n, type Lang } from "@/lib/i18n";

export interface WallEntry {
  key: string;
  b: number;
  c: number;
  v: number;
  end: number;
  by: string;
  byName: string;
  at: number;
  note?: string;
}

const bookName = (nr: number, lang: Lang) => {
  const book = getBook(nr);
  return book ? (lang === "es" ? book.es : book.en) : "";
};

export default function VerseWall({
  entries,
  onTakeDown,
  canTakeDown,
  empty,
  startOpen = false,
}: {
  entries: WallEntry[];
  /** absent where the reader is only looking */
  onTakeDown?: (key: string) => void;
  canTakeDown?: (entry: WallEntry) => boolean;
  empty: string;
  /** whether verses arrive already open — true on the reader's own wall */
  startOpen?: boolean;
}) {
  const { lang, t } = useI18n();
  const router = useRouter();
  /**
   * The verses that are NOT in the state this wall opens in.
   *
   * Kept as the exception rather than as the answer, so that a verse hung
   * while the wall is on screen arrives in the same state as the rest of them
   * instead of being the one row that came out wrong.
   */
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [verses, setVerses] = useState<Record<string, string>>({});
  /** when and where this wall was last tapped, for spotting a double tap */
  const lastTap = useRef<{ key: string; at: number; x: number; y: number } | null>(
    null
  );
  /** where the finger went down, so a flick is not mistaken for a tap */
  const tapStart = useRef<{ x: number; y: number } | null>(null);
  /** set when touch has just handled a gesture, so the synthetic click is not
      allowed to handle it a second time */
  const handled = useRef(0);

  /*
   * The scripture behind the references, in one pass.
   *
   * Fetched for the whole wall rather than on each tap: fetchVerses groups by
   * book, so a wall spread across the Bible costs a request per book once,
   * where fetching on open would cost one per tap and put a pause in front of
   * every verse somebody wanted to read.
   */
  useEffect(() => {
    const refs = entries
      .map((e) => parseBmKey(e.key))
      .filter((r): r is BmRef => r !== null)
      .flatMap((r) =>
        bmVerses(r).map((v) => ({ bookNr: r.b, chapter: r.c, verse: v }))
      )
      .filter((r) => verses[verseKey(r.bookNr, r.chapter, r.verse)] === undefined);
    if (refs.length === 0) return;

    let cancelled = false;
    // whichever translation the reader was last left in, the same way the
    // journal decides it
    let translation = DEFAULT_TRANSLATION;
    try {
      const saved = JSON.parse(
        window.localStorage.getItem("communion.reading") ?? "null"
      ) as { translation?: string } | null;
      if (saved?.translation) translation = saved.translation;
    } catch {
      // nothing remembered: the default is right
    }
    fetchVerses(translation, refs)
      .then(({ verses: got }) => {
        if (cancelled || got.size === 0) return;
        setVerses((prev) => ({ ...prev, ...Object.fromEntries(got) }));
      })
      .catch(() => {
        // offline and not downloaded: the references still stand on their own
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  if (entries.length === 0) {
    return <p className="empty glass card">{empty}</p>;
  }

  const toggle = (key: string) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const read = (entry: WallEntry) => {
    handled.current = Date.now();
    router.push(`/?b=${entry.b}&c=${entry.c}&v=${entry.v}`);
  };

  /**
   * Two taps on the words, and you are reading them in context.
   *
   * Done by hand rather than left to `dblclick`, which phones fire late,
   * inconsistently, and never at all where the browser has decided the
   * gesture was a zoom. The window is deliberately short and the slack
   * deliberately tight: two taps far apart, or slowly, are two people
   * changing their mind rather than one person asking for something.
   *
   * A tap that lands inside a text selection is left alone — somebody
   * double-tapping to select a word is not asking to leave the page.
   */
  const onTapStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    tapStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const onTap = (entry: WallEntry, e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    const from = tapStart.current;
    tapStart.current = null;
    if (!touch || !from) return;

    // A tap is a finger that did not travel. Without this, two quick upward
    // flicks down the same verse — finger down low, up high, twice — ended
    // within a few pixels of each other and read as a double tap, so scrolling
    // a wall threw the reader into the chapter.
    if (
      Math.abs(touch.clientX - from.x) > 12 ||
      Math.abs(touch.clientY - from.y) > 12
    ) {
      lastTap.current = null;
      return;
    }

    const now = Date.now();
    const last = lastTap.current;
    lastTap.current = { key: entry.key, at: now, x: touch.clientX, y: touch.clientY };
    if (
      last &&
      last.key === entry.key &&
      now - last.at < 320 &&
      Math.abs(touch.clientX - last.x) < 28 &&
      Math.abs(touch.clientY - last.y) < 28
    ) {
      if (!window.getSelection()?.toString()) {
        lastTap.current = null;
        read(entry);
      }
    }
  };

  /**
   * The mouse's way in.
   *
   * Phones synthesise a dblclick after a real double tap, which would call
   * router.push a second time for one gesture — so a click arriving on the
   * heels of a touch we already answered is ignored.
   */
  const onDouble = (entry: WallEntry) => {
    if (Date.now() - handled.current < 900) return;
    read(entry);
  };

  return (
    <div className="wall-list">
      {entries.map((entry) => {
        const ref = parseBmKey(entry.key);
        if (!ref) return null;
        const label = bmRefLabel(bookName(entry.b, lang), ref);
        const shown = startOpen !== flipped.has(entry.key);
        const lines = bmVerses(ref).map((v) => ({
          v,
          text: verses[verseKey(entry.b, entry.c, v)],
        }));
        return (
          <div key={entry.key} className="glass card wall-item">
            <div className="wall-head">
              <button
                type="button"
                className="wall-open"
                aria-expanded={shown}
                onClick={() => toggle(entry.key)}
              >
                <span className="wall-caret" aria-hidden>
                  {shown ? "▾" : "▸"}
                </span>
                <span className="wall-ref">{label}</span>
              </button>
              <span className="wall-actions">
                <Link
                  href={`/?b=${entry.b}&c=${entry.c}&v=${entry.v}`}
                  className="jr-share"
                  aria-label={t("wall.read")}
                  title={t("wall.read")}
                >
                  <Icon name="book" />
                </Link>
                {onTakeDown && canTakeDown?.(entry) && (
                  <button
                    type="button"
                    className="jr-share jr-danger"
                    onClick={() => onTakeDown(entry.key)}
                    aria-label={t("wall.takeDown", { ref: label })}
                    title={t("wall.takeDown", { ref: label })}
                  >
                    <Icon name="close" />
                  </button>
                )}
              </span>
            </div>
            {/* who put it up, which is what makes a wall a room rather than a
                list — kept on the shut row, because it is part of the glance */}
            <p className="wall-by">
              {t("wall.hungBy", { name: entry.byName })}
              {entry.note ? ` · ${entry.note}` : ""}
            </p>
            {shown && (
              <div
                className="wall-text"
                onDoubleClick={() => onDouble(entry)}
                onTouchStart={onTapStart}
                onTouchEnd={(e) => onTap(entry, e)}
                title={t("wall.read")}
              >
                {lines.every((l) => l.text === undefined) ? (
                  <p className="skeleton">{t("common.loading")}</p>
                ) : (
                  lines.map((line) => (
                    <p key={line.v}>
                      <sup className="verse-num">{line.v}</sup>
                      {line.text ?? ""}
                    </p>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
