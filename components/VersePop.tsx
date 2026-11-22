"use client";

// A passage, over whatever cited it, without leaving it — and the way into
// The Word for anyone who wants the chapter round it.
//
// Opened by a Bible reference in a Bookshelf book (components/BookView) and
// by an era's passages on the Maps tab (components/AtlasMap). The King James
// in English and the Reina-Valera in Spanish: the two texts the app carries
// itself, so it can show them offline and from any page.

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import { getBook } from "@/lib/bible";
import type { BookRef } from "@/lib/bookshelf";
import { useI18n } from "@/lib/i18n";
import { fetchChapter } from "@/lib/scripture";

/**
 * A passage's words in the reader's language, fetched: the verses while they
 * come, nothing if they could not, and how to name it. Shared by the pop-up
 * and by anything that shows the words in place (an era's card on a map).
 */
export function usePassage(verse: BookRef) {
  const { lang } = useI18n();
  const [text, setText] = useState<Array<{ verse: number; text: string }> | null>(null);
  const [missing, setMissing] = useState(false);
  const translation = lang === "es" ? "valera" : "kjv";
  const book = getBook(verse.b);
  const name = book ? (lang === "es" ? book.es : book.en) : "";
  const label = `${name} ${verse.c}${
    verse.v
      ? `:${verse.v}${verse.ve ? `–${verse.ve}` : ""}${verse.more ? `, ${verse.more.join(", ")}` : ""}`
      : ""
  }`;

  useEffect(() => {
    let live = true;
    setText(null);
    setMissing(false);
    fetchChapter(translation, verse.b, verse.c)
      .then((data) => {
        if (!live) return;
        // a verse, a range, a verse and a few more — or the whole chapter
        const from = verse.v ?? 1;
        const to = verse.ve ?? verse.v ?? data.verses.length;
        setText(
          data.verses.filter(
            (v) => (v.verse >= from && v.verse <= to) || verse.more?.includes(v.verse)
          )
        );
      })
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [verse, translation]);

  return { text, missing, label, translation: translation === "kjv" ? "KJV" : "RV1909" };
}

/** The words of a passage, numbered when there are more verses than one. */
export function PassageWords({ text }: { text: Array<{ verse: number; text: string }> }) {
  return (
    <>
      {text.map((v) => (
        <Fragment key={v.verse}>
          {text.length > 1 && <sup>{v.verse}</sup>}
          {v.text}{" "}
        </Fragment>
      ))}
    </>
  );
}

export default function VersePop({
  verse,
  onClose,
  over = false,
}: {
  /** the passage: a verse, a range, a verse and a few more, or a chapter */
  verse: BookRef;
  onClose: () => void;
  /** over something that is itself over the page — a full-screen map */
  over?: boolean;
}) {
  const { t } = useI18n();
  const { text, missing, label, translation } = usePassage(verse);

  useEffect(() => {
    // Escape closes this and nothing under it: heard first, on the way down,
    // and kept from going further — a map under it closes on Escape too
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);

  // On the page itself, never inside whatever cited it: a glass card (an
  // era's card on a map) holds anything fixed within its own bounds
  return createPortal(
    <div className={`modal-overlay${over ? " over-panel" : ""}`} onClick={onClose}>
      <div
        className="glass modal bk-verse-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bk-verse-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mh-head">
          <h2 id="bk-verse-title">
            {label} <span className="bk-pop-tr">{translation}</span>
          </h2>
          <button type="button" className="lex-close" onClick={onClose} aria-label={t("common.close")}>
            ✕
          </button>
        </div>
        {missing ? (
          <p className="cal-hint">{t("shelf.verseOffline")}</p>
        ) : text ? (
          <p className="bk-pop-text">
            <PassageWords text={text} />
          </p>
        ) : (
          <div className="skeleton bk-pop-wait" />
        )}
        <div className="modal-actions">
          <Link
            className="btn btn-primary"
            href={`/?b=${verse.b}&c=${verse.c}${verse.v ? `&v=${verse.v}` : ""}`}
          >
            <Icon name="book" /> {t("shelf.openInWord")}
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}
