"use client";

// A wall of verses, hung by people.
//
// Shut by default, and that is the whole design of it. A wall's job is to say
// at a glance what a room is built on — six references read in two seconds is
// exactly that, and six verses in full is a page nobody scrolls. Tap one and
// it opens where it is; the text is already there, fetched when the wall was,
// so opening is instant rather than a wait.

import Link from "next/link";
import Icon from "@/components/Icon";
import { useEffect, useState } from "react";
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
}: {
  entries: WallEntry[];
  /** absent where the reader is only looking */
  onTakeDown?: (key: string) => void;
  canTakeDown?: (entry: WallEntry) => boolean;
  empty: string;
}) {
  const { lang, t } = useI18n();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [verses, setVerses] = useState<Record<string, string>>({});

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
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="wall-list">
      {entries.map((entry) => {
        const ref = parseBmKey(entry.key);
        if (!ref) return null;
        const label = bmRefLabel(bookName(entry.b, lang), ref);
        const shown = open.has(entry.key);
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
              <div className="wall-text">
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
