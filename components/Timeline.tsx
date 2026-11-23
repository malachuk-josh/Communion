"use client";

// The Maps tab's Timeline: the whole Bible on one line, from Creation to
// Patmos.
//
// It took the place of the Chapters tab, which listed every chapter with a
// map and said nothing about when any of it happened. Here the moments of
// every era's story stand in the order they happened (public/maps/
// timeline.json, scripts/build-era-story.mjs), with the eras over them and
// the silent years between Malachi and John where they fall.
//
//   the ribbon   pinned over the list: the eras side by side, each in its
//                realm's colour, and a marker that follows the reading down
//                the page. Tapped or dragged along, it goes to the moment
//                nearest that point. Within an era it is to scale; the short
//                eras are drawn wider than their years, or the whole New
//                Testament would be a sliver too thin to touch.
//   a moment     its year, and its title; opened, what happened, the verse
//                that tells it, and the ways on: its era's map at that very
//                step of the story, its journey, The Word
//   the reading  the chapter last read in The Word, the moment nearest it,
//                and that chapter's map (what the Chapters tab was for)

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Open } from "@/components/Atlas";
import Icon from "@/components/Icon";
import { PassageWords, usePassage } from "@/components/VersePop";
import type { Atlas } from "@/lib/atlas";
import { BOOKS } from "@/lib/bible";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { onScroll, scrollToY, scrollY, scrollerTop } from "@/lib/scroller";
import { readLocal } from "@/lib/storage";
import {
  loadTimeline,
  spanLabel,
  yearLabel,
  type Timeline as TimelineData,
  type TimelineEra,
  type TimelineEvent,
} from "@/lib/timeline";

/** The ribbon's share, in percent, for the years before Abraham — and the least for any era. */
const STUB = 6;
const LEAST = 5.5;
/** Round years marked under the ribbon. */
const TICKS = [-2000, -1000, -500, 1];

interface Segment {
  /** an era's id, or "silence" for the years between the testaments */
  id: string;
  tone: number | null;
  left: number;
  width: number;
  from?: number;
  to?: number;
}

/**
 * The ribbon: the years before Abraham a stub at the start, then each era
 * to the width of its years — but none narrower than LEAST — with the
 * silence between the testaments in its place.
 */
function lay(eras: TimelineEra[]): Segment[] {
  const spans: Omit<Segment, "left" | "width">[] = [];
  let end: number | null = null;
  for (const e of eras) {
    if (e.from === undefined || e.to === undefined) continue;
    if (end !== null && e.from > end) spans.push({ id: "silence", tone: null, from: end, to: e.from });
    spans.push({ id: e.id, tone: e.tone, from: e.from, to: e.to });
    end = e.to;
  }
  const years = (s: (typeof spans)[number]) => (s.to ?? 0) - (s.from ?? 0);
  const least = new Set<number>();
  let widths: number[] = [];
  for (;;) {
    const free = 100 - STUB - LEAST * least.size;
    const sum = spans.reduce((a, s, i) => (least.has(i) ? a : a + years(s)), 0);
    widths = spans.map((s, i) => (least.has(i) ? LEAST : (free * years(s)) / sum));
    const thin = widths.flatMap((w, i) => (!least.has(i) && w < LEAST ? [i] : []));
    if (!thin.length) break;
    thin.forEach((i) => least.add(i));
  }
  const first = eras.find((e) => e.from === undefined);
  const out: Segment[] = first ? [{ id: first.id, tone: first.tone, left: 0, width: STUB }] : [];
  let left = first ? STUB : 0;
  spans.forEach((s, i) => {
    out.push({ ...s, left, width: widths[i] });
    left += widths[i];
  });
  return out;
}

/** Where a year falls on the ribbon, in percent, inside a span that runs lo..hi. */
function along(seg: Segment, year: number, lo = seg.from, hi = seg.to): number {
  if (lo === undefined || hi === undefined || hi === lo) return seg.left + seg.width / 2;
  const f = Math.min(1, Math.max(0, (year - lo) / (hi - lo)));
  return seg.left + seg.width * f;
}

/**
 * The moments stood on the ribbon: each in its own era's span, at its year.
 *
 * An era's story can begin before the years given for it — the exile's
 * with Nineveh falling, while Judah still stands — so a span is read as
 * running from its earliest moment to its last. Moments of one year are
 * set a little apart, so that a finger dragged along can stop at each.
 */
function place(events: TimelineEvent[], segs: Segment[]): number[] {
  const undated = events.filter((e) => e.year === null).length;
  let k = 0;
  const xs = events.map((e) => {
    const seg = segs.find((s) => s.id === e.era);
    if (!seg) return 0;
    if (e.year === null) return seg.left + (seg.width * (k++ + 0.5)) / Math.max(1, undated);
    const years = events.flatMap((o) => (o.era === e.era && o.year !== null ? [o.year] : []));
    const lo = Math.min(seg.from ?? Infinity, ...years);
    const hi = Math.max(seg.to ?? -Infinity, ...years);
    return along(seg, e.year, lo, hi);
  });
  const GAP = 0.7;
  for (let i = 0; i < xs.length; ) {
    let j = i + 1;
    while (j < xs.length && events[j].era === events[i].era && Math.abs(xs[j] - xs[i]) < 1e-6) j++;
    const n = j - i;
    if (n > 1) {
      const seg = segs.find((s) => s.id === events[i].era);
      const lo = seg ? seg.left : 0;
      const hi = seg ? seg.left + seg.width : 100;
      // centred on the year, but kept inside the era
      const start = Math.min(hi - GAP * (n - 1), Math.max(lo, xs[i] - (GAP * (n - 1)) / 2));
      for (let m = 0; m < n; m++) xs[i + m] = start + GAP * m;
    }
    i = j;
  }
  return xs;
}

export default function Timeline({ atlas, open }: { atlas: Atlas; open: Open }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  /** undefined while it is on its way, null where it could not be had */
  const [data, setData] = useState<TimelineData | null | undefined>(undefined);
  /** the moments opened to their words */
  const [shown, setShown] = useState<Set<number>>(() => new Set());
  /** the moment at the top of the list, under the ribbon */
  const [cur, setCur] = useState(0);
  /** the chapter last read in The Word, where this device remembers one */
  const [reading, setReading] = useState<{ book: number; chapter: number } | null>(null);

  const head = useRef<HTMLDivElement>(null);
  const ribbon = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  /** until when the list's scrolling is the ribbon's own doing, and not to be followed */
  const quiet = useRef(0);
  const dragging = useRef(false);

  useEffect(() => {
    let live = true;
    loadTimeline().then((d) => {
      if (live) setData(d);
    });
    return () => {
      live = false;
    };
  }, []);

  // read in an effect: storage is not there to ask while the server renders
  useEffect(() => {
    try {
      const saved = JSON.parse(readLocal("communion.reading") ?? "null");
      const book = Number(saved?.bookNr);
      const chapter = Number(saved?.chapter);
      if (Number.isInteger(book) && book >= 1 && book <= 66 && Number.isInteger(chapter) && chapter >= 1) {
        setReading({ book, chapter });
      }
    } catch {
      // nothing remembered, or nothing readable
    }
  }, []);

  const segs = useMemo(() => (data ? lay(data.eras) : []), [data]);
  const xs = useMemo(() => (data ? place(data.events, segs) : []), [data, segs]);
  const events = data?.events ?? [];

  const book = (nr: number) => BOOKS[nr - 1]?.[lang === "es" ? "es" : "en"] ?? "";
  const pick = (pair: [string, string]) => (lang === "es" ? pair[1] : pair[0]);
  const eraName = (id: string) =>
    id === "beginnings" ? t("timeline.beginnings") : t(`map.era.${id}` as MessageKey);
  /** An era's years — reaching back to its first moment where its story starts early. */
  const eraSpan = (era: TimelineEra) => {
    if (era.from === undefined || era.to === undefined) return `${book(1)} 1–11`;
    const years = events.flatMap((e) => (e.era === era.id && e.year !== null ? [e.year] : []));
    return spanLabel(Math.min(era.from, ...years), Math.max(era.to, ...years), lang);
  };
  const when = (e: TimelineEvent) => (e.year === null ? "" : yearLabel(e.year, !!e.c, lang));
  const hasEraMap = (id: string) => atlas.eras.some((e) => e.id === id);
  const hasChapterMap = (b: number, c: number) => (atlas.books[String(b)] ?? []).includes(c);
  const journeyOf = (id?: string) => (id ? atlas.journeys.find((j) => j.id === id) : undefined);

  // The marker follows the list: the moment at the top, just under the
  // ribbon, is the one it stands on.
  useEffect(() => {
    if (!events.length) return;
    let frame = 0;
    const follow = () => {
      frame = 0;
      if (dragging.current || performance.now() < quiet.current) return;
      const line = (head.current?.getBoundingClientRect().bottom ?? 0) + 24;
      let at = 0;
      for (let i = 0; i < rows.current.length; i++) {
        const el = rows.current[i];
        if (!el) continue;
        if (el.getBoundingClientRect().top <= line) at = i;
        else break;
      }
      setCur(at);
    };
    const off = onScroll(() => {
      if (!frame) frame = requestAnimationFrame(follow);
    });
    follow();
    return () => {
      off();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [events.length]);

  /** Bring a moment up under the ribbon. */
  const goTo = (i: number, smooth = false) => {
    const el = rows.current[i];
    if (!el) return;
    setCur(i);
    quiet.current = performance.now() + (smooth ? 900 : 200);
    const below = head.current?.getBoundingClientRect().height ?? 0;
    const top = el.getBoundingClientRect().top - scrollerTop() + scrollY() - below - 10;
    scrollToY(Math.max(0, top), smooth ? "smooth" : "auto");
  };

  /** The moment nearest a point on the ribbon. */
  const nearest = (clientX: number): number => {
    const box = ribbon.current?.getBoundingClientRect();
    if (!box || !xs.length) return 0;
    const x = ((clientX - box.left) / box.width) * 100;
    let best = 0;
    xs.forEach((xi, i) => {
      if (Math.abs(xi - x) < Math.abs(xs[best] - x)) best = i;
    });
    return best;
  };

  const toggle = (i: number) =>
    setShown((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // the moment nearest the chapter being read, in the same book
  const near = useMemo(() => {
    if (!reading) return -1;
    let best = -1;
    events.forEach((e, i) => {
      if (e.ref[0] !== reading.book) return;
      const d = Math.abs(e.ref[1] - reading.chapter);
      if (best === -1 || d < Math.abs(events[best].ref[1] - reading.chapter)) best = i;
    });
    return best;
  }, [events, reading]);

  if (data === undefined) return <div className="skeleton atlas-wait" aria-hidden />;
  if (data === null) {
    return (
      <div className="glass card jr-empty">
        <p>{t("maps.failed")}</p>
      </div>
    );
  }

  const now = events[cur];
  const nowEra = data.eras.find((e) => e.id === now?.era);
  const readingMap = reading !== null && hasChapterMap(reading.book, reading.chapter);

  // the moments under their eras, in order, the silence where it falls
  const groups = data.eras
    .map((era) => ({
      era,
      items: events.flatMap((e, i) => (e.era === era.id ? [i] : [])),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="timeline">
      <div className="tl-head" ref={head}>
        <div className="tl-now" aria-live="polite">
          <span className="tl-now-era">{nowEra ? eraName(nowEra.id) : ""}</span>
          <span className="tl-now-year">{now ? when(now) || eraSpan(nowEra ?? data.eras[0]) : ""}</span>
        </div>
        <div
          ref={ribbon}
          className="tl-ribbon"
          role="slider"
          tabIndex={0}
          aria-label={t("timeline.ribbon")}
          aria-valuemin={1}
          aria-valuemax={events.length}
          aria-valuenow={cur + 1}
          aria-valuetext={now ? `${pick(now.title)}${when(now) ? `, ${when(now)}` : ""}` : undefined}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            goTo(nearest(e.clientX));
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return;
            const i = nearest(e.clientX);
            if (i !== cur) goTo(i);
          }}
          onPointerUp={() => {
            dragging.current = false;
            quiet.current = performance.now() + 200;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
          onKeyDown={(e) => {
            const to =
              e.key === "ArrowRight" || e.key === "ArrowDown"
                ? cur + 1
                : e.key === "ArrowLeft" || e.key === "ArrowUp"
                  ? cur - 1
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? events.length - 1
                      : null;
            if (to === null) return;
            e.preventDefault();
            goTo(Math.min(events.length - 1, Math.max(0, to)));
          }}
        >
          <span className="tl-track">
            {segs.map((s) => (
              <span
                key={s.id}
                className={`tl-seg${s.tone === null ? " tl-seg-silence" : ""}${
                  now?.era === s.id ? " on" : ""
                }`}
                style={{
                  left: `${s.left}%`,
                  width: `${s.width}%`,
                  ...(s.tone !== null ? { ["--rgb" as string]: `var(--realm-${s.tone})` } : {}),
                }}
              />
            ))}
          </span>
          {near >= 0 && (
            <span className="tl-here" style={{ left: `${xs[near]}%` }} aria-hidden />
          )}
          <span className="tl-mark" style={{ left: `${xs[cur] ?? 0}%` }} aria-hidden />
        </div>
        <div className="tl-ticks" aria-hidden>
          {TICKS.map((y) => {
            const seg = segs.find((s) => s.from !== undefined && s.to !== undefined && y >= s.from && y <= s.to);
            return (
              seg && (
                <span key={y} style={{ left: `${along(seg, y)}%` }}>
                  {yearLabel(y, false, lang)}
                </span>
              )
            );
          })}
        </div>
      </div>

      <p className="cal-hint tl-hint">{t("timeline.hint")}</p>

      {reading && (near >= 0 || readingMap) && (
        <div className="glass card tl-reading">
          <p className="tl-reading-label">{t("maps.reading")}</p>
          <p className="tl-reading-title">
            {book(reading.book)} {reading.chapter}
          </p>
          {near >= 0 && (
            <p className="tl-reading-near">
              {pick(events[near].title)}
              {when(events[near]) && ` · ${when(events[near])}`}
            </p>
          )}
          <div className="tl-actions">
            {near >= 0 && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setShown((s) => new Set(s).add(near));
                  // after the moment has opened, so it is measured as it will stand
                  requestAnimationFrame(() => goTo(near, true));
                }}
              >
                <Icon name="timeline" /> {t("timeline.find")}
              </button>
            )}
            {readingMap && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => open({ kind: "chapter", book: reading.book, chapter: reading.chapter })}
              >
                <Icon name="pin" /> {t("timeline.chapterMap")}
              </button>
            )}
          </div>
        </div>
      )}

      <ol className="tl-line">
        {groups.map(({ era, items }, gi) => {
          const next = groups[gi + 1]?.era;
          const silent = era.to !== undefined && next?.from !== undefined && next.from > era.to;
          return (
            <li
              key={era.id}
              className="tl-era"
              style={{ ["--rgb" as string]: `var(--realm-${era.tone})` }}
            >
              <div className="tl-era-head">
                <span className="tl-era-dot" aria-hidden />
                <div className="tl-era-main">
                  <h2>{eraName(era.id)}</h2>
                  <span className="tl-era-span">{eraSpan(era)}</span>
                </div>
                {hasEraMap(era.id) && (
                  <button
                    type="button"
                    className="btn btn-sm tl-era-map"
                    aria-label={t("timeline.eraMapOf", { era: eraName(era.id) })}
                    onClick={() => open({ kind: "era", id: era.id })}
                  >
                    <Icon name="pin" /> {t("timeline.eraMap")}
                  </button>
                )}
              </div>
              <ol className="tl-moments">
                {items.map((i) => {
                  const e = events[i];
                  const isOpen = shown.has(i);
                  const journey = journeyOf(e.journey);
                  const stepMap = e.step !== undefined && hasEraMap(e.era);
                  const chapterMap = !stepMap && e.map && hasChapterMap(e.map[0], e.map[1]) ? e.map : null;
                  return (
                    <li
                      key={i}
                      ref={(el) => {
                        rows.current[i] = el;
                      }}
                      className={`tl-moment${isOpen ? " open" : ""}${i === cur ? " now" : ""}`}
                    >
                      <button
                        type="button"
                        className="tl-moment-head"
                        aria-expanded={isOpen}
                        onClick={() => toggle(i)}
                      >
                        <span className="tl-dot" aria-hidden />
                        {e.year !== null && <span className="tl-year">{when(e)}</span>}
                        <span className="tl-title">{pick(e.title)}</span>
                      </button>
                      {isOpen && (
                        <div className="glass card tl-body">
                          <p className="tl-words">{pick(e.words)}</p>
                          <MomentPassage ref_={e.ref} />
                          <div className="tl-actions">
                            {stepMap && (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => open({ kind: "era", id: e.era, step: e.step })}
                              >
                                <Icon name="pin" /> {t("timeline.onMap")}
                              </button>
                            )}
                            {chapterMap && (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => open({ kind: "chapter", book: chapterMap[0], chapter: chapterMap[1] })}
                              >
                                <Icon name="pin" /> {t("timeline.onMap")}
                              </button>
                            )}
                            {journey && (
                              <button
                                type="button"
                                className="btn btn-sm"
                                // the journey's own name is long; it is the heading of the map this opens
                                aria-label={t(`map.journey.${journey.id}` as MessageKey)}
                                title={t(`map.journey.${journey.id}` as MessageKey)}
                                onClick={() => open({ kind: "journey", id: journey.id })}
                              >
                                <Icon name="runner" /> {t("timeline.journey")}
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => router.push(`/?b=${e.ref[0]}&c=${e.ref[1]}&v=${e.ref[2]}`)}
                            >
                              <Icon name="book" /> {t("timeline.read")}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              {silent && (
                <div className="tl-silence">
                  <h2>{t("timeline.silenceTitle")}</h2>
                  <p>{t("timeline.silence")}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <p className="cal-hint tl-note">{t("timeline.approx")}</p>
    </div>
  );
}

/** The verse a moment is told in, in the reader's translation. */
function MomentPassage({ ref_: [b, c, v, last] }: { ref_: TimelineEvent["ref"] }) {
  const { t } = useI18n();
  // one passage is one fetch, however often the list above is drawn again
  const verse = useMemo(() => ({ text: "", b, c, v, ve: last }), [b, c, v, last]);
  const { text, missing, label, translation } = usePassage(verse);
  return (
    <div className="tl-passage">
      <p className="tl-passage-ref">
        {label} <span className="bk-pop-tr">{translation}</span>
      </p>
      {missing ? (
        <p className="cal-hint">{t("shelf.verseOffline")}</p>
      ) : text ? (
        <p className="tl-passage-text">
          <PassageWords text={text} />
        </p>
      ) : (
        <div className="skeleton bk-pop-wait" />
      )}
    </div>
  );
}
