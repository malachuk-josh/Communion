"use client";

// The demo, living where somebody curious about the app already is.
//
// This is the marketing deck folded back into the product: ten screens of the
// app itself, each with one line about what it is. A slide deck is the wrong
// shape inside a phone, so it is a shelf you thumb through sideways — the
// gesture the rest of the app already taught.
//
// The images are plain files under /tour, fetched lazily and left out of the
// service worker's caches on purpose: someone who reads About once should not
// carry 650KB of pictures around for it. Every image states its aspect ratio
// inline so the shelf is laid out before a single byte of it arrives, and the
// strip never reflows as slides load in.

import { useI18n, type MessageKey } from "@/lib/i18n";

/** Every slide: the file under /tour, its pixel size, and its i18n stem. */
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

export default function AboutTour() {
  const { t } = useI18n();
  return (
    <>
      <h3>{t("about.tourTitle")}</h3>
      <p className="tour-hint">{t("about.tourHint")}</p>
      <div className="tour-strip" role="list">
        {SLIDES.map(({ img, w, h, key }) => (
          <figure className="tour-slide" role="listitem" key={img}>
            <img
              src={`/tour/${img}.jpg`}
              alt={t(`about.${key}` as MessageKey)}
              loading="lazy"
              decoding="async"
              style={{ aspectRatio: `${w} / ${h}` }}
            />
            <figcaption>
              <strong>{t(`about.${key}` as MessageKey)}</strong>
              <span>{t(`about.${key}Desc` as MessageKey)}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
