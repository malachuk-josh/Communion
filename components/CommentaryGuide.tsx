"use client";

// The commentary for a day of a plan read with one: what Matthew Henry, or
// Spurgeon in the Treasury of David, wrote on that day's reading.
//
// The same arrangement as the devotional beside it, and for the same reason:
// a plan card is a line and a day number, and this is a sitting — several
// hundred words at the least, a few thousand on a long psalm — so it waits
// behind a button and opens over the page.
//
// It is the whole of the day, in order, not one verse's note. In The Word the
// commentary is opened from a verse and answers for that verse; here it is
// read through from the top, as a guide to the chapter, so each note carries
// the verses it is about and the reading itself is a tap away.

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import { getBook } from "@/lib/bible";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { intoParagraphs } from "@/lib/paragraphs";
import { readingHref, readingLabel, type Plan, type Reading } from "@/lib/plans";

interface Note {
  from: number;
  to?: number;
  title?: string;
  text: string;
}

type HenryBook = Record<string, Note[]>;
type Treasury = Record<string, { overview?: string; verses: Note[] }>;

/** What goes under one reading: an introduction, where there is one, and the notes. */
interface Block {
  reading: Reading;
  overview?: string;
  notes: Note[];
}

/*
 * Each file once, for every guide that opens it. A book of Henry is a few
 * hundred kilobytes and the Treasury is four megabytes, and somebody reading
 * a plan opens the same one again tomorrow. A request that fails is let go,
 * so the next opening asks again rather than remembering the failure.
 */
const held = new Map<string, Promise<unknown>>();
function load<T>(url: string): Promise<T> {
  let pending = held.get(url);
  if (!pending) {
    pending = fetch(url).then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    });
    pending.catch(() => held.delete(url));
    held.set(url, pending);
  }
  return pending as Promise<T>;
}

/** Whether a note falls inside the part of a chapter being read. */
function within(note: Note, r: Reading): boolean {
  if (!r.v || !r.ve) return true;
  // a note on the whole psalm opens it, so it belongs to the first day of it
  if (note.from === 0) return r.v === 1;
  return note.from >= r.v && note.from <= r.ve;
}

async function blocksFor(plan: Plan, readings: Reading[]): Promise<Block[]> {
  if (plan.guide === "spurgeon") {
    const treasury = await load<Treasury>("/treasury/19.json");
    return readings.map((r) => {
      const psalm = treasury[String(r.c)];
      return {
        reading: r,
        // the introduction is to the whole psalm, so it goes with its start
        overview: !r.v || r.v === 1 ? psalm?.overview : undefined,
        notes: (psalm?.verses ?? []).filter((n) => within(n, r)),
      };
    });
  }
  const books = new Map<number, HenryBook>();
  for (const b of new Set(readings.map((r) => r.b))) {
    books.set(b, await load<HenryBook>(`/commentary/${b}.json`));
  }
  return readings.map((r) => ({
    reading: r,
    notes: (books.get(r.b)?.[String(r.c)] ?? []).filter((n) => within(n, r)),
  }));
}

export default function CommentaryGuide({
  plan,
  day,
  onClose,
  onMark,
}: {
  plan: Plan;
  /** which day of the plan, counting from one */
  day: number;
  onClose: () => void;
  /** marks the day read, for a plan that is still underway */
  onMark?: () => void;
}) {
  const { lang, t } = useI18n();
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [failed, setFailed] = useState(false);
  // document.body does not exist until this is on a client
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const readings = plan.days[day - 1]?.readings ?? [];

  useEffect(() => {
    let cancelled = false;
    setBlocks(null);
    setFailed(false);
    blocksFor(plan, readings)
      .then((next) => {
        if (!cancelled) setBlocks(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // the day is the thing that changes; readings is derived from it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id, day]);

  // Escape closes it, as it closes the devotional and the reader's panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const label = (r: Reading) => {
    const book = getBook(r.b);
    return readingLabel(r, book ? (lang === "es" ? book.es : book.en) : "");
  };

  /** "Verses 4–8": what a note is about, so it can be read against the text. */
  const span = (note: Note, r: Reading) => {
    if (note.from === 0) return t("guide.wholePsalm");
    // the last note of a part runs to the end of the part
    const to = note.to ?? r.ve;
    if (to === undefined) return t("guide.versesFrom", { n: String(note.from) });
    if (to <= note.from) return t("guide.verse", { n: String(note.from) });
    return t("guide.verses", { from: String(note.from), to: String(to) });
  };

  const empty = blocks !== null && blocks.every((b) => !b.overview && b.notes.length === 0);

  // Out to the body, for the reason the devotional gives: the plan row is
  // glass, and a backdrop filter would make it the frame of this overlay.
  const panel = (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass modal guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mh-head">
          <h2 id="guide-title">
            <Icon name="quote" /> {t("discover.day", { n: String(day) })}
          </h2>
          <button
            type="button"
            className="lex-close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>
        <p className="guide-plan">{t(`plan.${plan.id}` as MessageKey)}</p>
        {failed ? (
          <p className="cal-hint">{t("guide.failed")}</p>
        ) : blocks === null ? (
          <p className="skeleton">{t("common.loading")}</p>
        ) : empty ? (
          <p className="cal-hint">{t("guide.none")}</p>
        ) : (
          <div className="mh-body guide-body">
            {/* Henry and Spurgeon are set as they wrote, so a Spanish reader
                is told why the guide is not in Spanish before it begins */}
            {lang === "es" && <p className="guide-lang">{t("guide.english")}</p>}
            {blocks.map((block) => (
              <section
                key={`${block.reading.b}:${block.reading.c}:${block.reading.v ?? 0}`}
                className="mh-voice"
              >
                <p className="mh-by">{label(block.reading)}</p>
                {/* the reading itself, so the text is never more than a tap
                    from what is being said about it */}
                <Link className="dv-ref" href={readingHref(block.reading, "journal")}>
                  <Icon name="book" /> {t("guide.read", { ref: label(block.reading) })}
                </Link>
                {block.overview && (
                  <div className="mh-overview">
                    {intoParagraphs(block.overview).map((para, n) => (
                      <p key={`o${n}`}>{para}</p>
                    ))}
                  </div>
                )}
                {block.notes.map((note) => (
                  <div key={note.from} className="guide-note">
                    <p className="guide-span">{span(note, block.reading)}</p>
                    {note.title && <p className="mh-title">{note.title}</p>}
                    {intoParagraphs(note.text).map((para, n) => (
                      <p key={n}>{para}</p>
                    ))}
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
        {onMark && blocks !== null && !failed && (
          <div className="guide-foot">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                onMark();
                onClose();
              }}
            >
              ✓ {t("discover.markRead")}
            </button>
          </div>
        )}
        <p className="mh-who">
          {t(plan.guide === "spurgeon" ? "reader.spurgeonWho" : "reader.commentaryWho")}
        </p>
      </div>
    </div>
  );

  return mounted ? createPortal(panel, document.body) : null;
}
