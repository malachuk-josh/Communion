"use client";

// The ten-screen tour, as a strip that any page can shelve.
//
// It began life inside the About page and was pulled out the day the welcome
// screen wanted it too. One list, one markup, so the two places that show the
// tour cannot drift apart — the same reason the menu is written once.
//
// Every screen was captured three times, once in each theme, and CSS picks
// the set that matches the theme the reader is actually in — a tour that
// shows the app as it looks right now, not as it looked to whoever took the
// pictures. No filter fakery: the grey captures keep their red letters and
// their gold buttons because that is genuinely how the grey theme paints
// them. Only the visible theme's images download — lazy loading skips a
// display:none image entirely.
//
// The files are plain JPEGs under /tour, left out of the service worker's
// caches on purpose: someone who meets the tour once should not carry the
// pictures around for it. Every image states its aspect ratio inline so the
// shelf is laid out before a single byte arrives, and never reflows.

import { useI18n, type MessageKey } from "@/lib/i18n";

/** Every slide: the file stem under /tour, its pixel size, its i18n stem. */
const SLIDES: Array<{ img: string; w: number; h: number; key: string }> = [
  { img: "reader", w: 720, h: 993, key: "tourReader" },
  { img: "study", w: 720, h: 977, key: "tourStudy" },
  { img: "lexicon", w: 720, h: 769, key: "tourLexicon" },
  { img: "concordance", w: 720, h: 1122, key: "tourConcordance" },
  { img: "redletters", w: 720, h: 1066, key: "tourRed" },
  { img: "gathering", w: 720, h: 869, key: "tourGathering" },
  { img: "sessions", w: 720, h: 929, key: "tourSessions" },
  { img: "prayer", w: 720, h: 720, key: "tourPrayer" },
  { img: "conversations", w: 720, h: 803, key: "tourConversations" },
  { img: "journal", w: 720, h: 924, key: "tourJournal" },
];

/** dark is the bare name; the other two carry their theme as a suffix */
const THEMES = [
  { cls: "tour-dark", suffix: "" },
  { cls: "tour-light", suffix: "-light" },
  { cls: "tour-grey", suffix: "-grey" },
];

export default function TourStrip() {
  const { t } = useI18n();
  return (
    <div className="tour-strip" role="list">
      {SLIDES.map(({ img, w, h, key }) => (
        <figure className="tour-slide" role="listitem" key={img}>
          {THEMES.map(({ cls, suffix }) => (
            <img
              key={cls}
              className={cls}
              src={`/tour/${img}${suffix}.jpg`}
              alt={t(`about.${key}` as MessageKey)}
              loading="lazy"
              decoding="async"
              style={{ aspectRatio: `${w} / ${h}` }}
            />
          ))}
          <figcaption>
            <strong>{t(`about.${key}` as MessageKey)}</strong>
            <span>{t(`about.${key}Desc` as MessageKey)}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
