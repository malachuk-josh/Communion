"use client";

// Spurgeon's two meditations for a day of the reading plan.
//
// Kept out of the plan card and behind a button because of what it is: two
// pieces of prose, several hundred words each. A plan card is a line and a
// day number, and a devotional is a sitting.
//
// The text is fetched when it is opened rather than with the plan, and once
// for the whole year — a day is a few hundred bytes of a file that is a
// megabyte and a half, and a reader who opens one will very likely open
// tomorrow's too. Held afterwards, so the second day costs nothing.

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import { getBook } from "@/lib/bible";
import { useI18n } from "@/lib/i18n";

interface Reading {
  ref: string;
  b: number;
  c: number;
  v?: number;
  /** the verse as Spurgeon quoted it, which is not always the whole verse */
  verse: string;
  text: string;
}

type Year = Record<string, { m?: Reading; e?: Reading }>;

/** One fetch for the year, shared by every card that opens it. */
let held: Promise<Year> | null = null;
function year(): Promise<Year> {
  if (!held) {
    held = fetch("/devotional/morneve.json")
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
  }
  return held;
}

/**
 * Long prose into paragraphs.
 *
 * Spurgeon wrote for a Victorian page and did not break for a phone. Split at
 * sentence ends and regrouped, which is close enough to a paragraph to read
 * like one — the same treatment the commentary panel gives him.
 */
function intoParagraphs(text: string): string[] {
  return text
    .split(/(?<=\.)\s+(?=[A-Z"'])/)
    .reduce<string[]>((paras, sentence) => {
      const last = paras[paras.length - 1];
      if (last && last.length < 420) paras[paras.length - 1] = `${last} ${sentence}`;
      else paras.push(sentence);
      return paras;
    }, [])
    .map((p) => p.trim())
    .filter(Boolean);
}

export default function Devotional({
  day,
  onClose,
}: {
  /** which day of the plan, counting from one */
  day: number;
  onClose: () => void;
}) {
  const { lang, t } = useI18n();
  const [readings, setReadings] = useState<{ m?: Reading; e?: Reading } | null>(
    null
  );
  // document.body does not exist until this is on a client
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    year().then((all) => {
      if (!cancelled) setReadings(all[String(day)] ?? {});
    });
    return () => {
      cancelled = true;
    };
  }, [day]);

  // Escape closes it, as it closes the concordance and the reader's panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const label = (r: Reading) => {
    const book = getBook(r.b);
    const name = book ? (lang === "es" ? book.es : book.en) : "";
    return `${name} ${r.c}${r.v ? `:${r.v}` : ""}`;
  };

  const part = (r: Reading | undefined, heading: string) =>
    r ? (
      <section className="mh-voice">
        <p className="mh-by">{heading}</p>
        <p className="dv-verse">{r.verse}</p>
        {/* the reference opens the chapter it came from, so the verse can be
            read where it sits rather than only as Spurgeon quoted it */}
        <Link className="dv-ref" href={`/?b=${r.b}&c=${r.c}&from=journal`}>
          <Icon name="book" /> {label(r)}
        </Link>
        {intoParagraphs(r.text).map((para, n) => (
          <p key={n}>{para}</p>
        ))}
      </section>
    ) : null;

  // Out to the body, not into the plan card.
  //
  // .glass carries a backdrop-filter, and a backdrop-filter makes an element
  // the containing block for anything fixed inside it. Rendered where it is
  // written, this overlay's `inset: 0` would mean the inside of the card —
  // the panel appears as a small box glued over one row, and the page behind
  // it is not dimmed and stays scrollable.
  const panel = (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh-head">
          <h2>
            <Icon name="sun" /> {t("devotional.title")}
          </h2>
          <button
            type="button"
            className="lex-close"
            onClick={onClose}
            aria-label={t("search.close")}
          >
            ✕
          </button>
        </div>
        {readings === null ? (
          <p className="skeleton">{t("common.loading")}</p>
        ) : !readings.m && !readings.e ? (
          <p className="cal-hint">{t("devotional.none")}</p>
        ) : (
          <div className="mh-body">
            {part(readings.m, t("devotional.morning"))}
            {part(readings.e, t("devotional.evening"))}
          </div>
        )}
        <p className="mh-who">{t("devotional.who")}</p>
      </div>
    </div>
  );

  return mounted ? createPortal(panel, document.body) : null;
}
