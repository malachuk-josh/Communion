"use client";

// The illustrated Bible in the text: a picture where a scene begins, between
// the section heading and the verse. A tap opens it full screen, with the
// chapter's other pictures a swipe away. Turned on and off from the reader's
// side panel (lib/bibleArt.ts, useTextPictures).

import { useState } from "react";
import PictureViewer from "@/components/PictureViewer";
import { BOOKS } from "@/lib/bible";
import { artLabel, passageLabel, type BibleArt } from "@/lib/bibleArt";
import { useI18n } from "@/lib/i18n";

export default function TextPictures({
  pics,
  chapterPics,
}: {
  /** the pictures beginning here — almost always one */
  pics: BibleArt[];
  /** every picture in the chapter, for stepping through from this one */
  chapterPics: BibleArt[];
}) {
  const { lang, t } = useI18n();
  const bookName = (nr: number) => {
    const b = BOOKS.find((x) => x.nr === nr);
    return b ? (lang === "es" ? b.es : b.en) : "";
  };
  const [open, setOpen] = useState<number | null>(null);
  const shown = open === null ? null : chapterPics[open];

  return (
    <>
      {pics.map((p) => (
        <figure key={p.id} className="text-pic">
          <button type="button" onClick={() => setOpen(chapterPics.findIndex((c) => c.id === p.id))}>
            <img src={p.src} alt={p.alt} loading="lazy" width={p.w} height={p.h} />
          </button>
          <figcaption>
            {artLabel(p, lang, bookName).label}
          </figcaption>
        </figure>
      ))}
      {shown && (
        <PictureViewer
          key={shown.id}
          src={shown.src}
          full={shown.full}
          alt={shown.alt}
          onClose={() => setOpen(null)}
          caption={{
            title: artLabel(shown, lang, bookName).label,
            refs: passageLabel(shown, bookName),
            note: [shown.note, t("pics.illustrationNote")].filter(Boolean).join(" "),
          }}
          step={
            chapterPics.length > 1
              ? {
                  at: `${open! + 1} / ${chapterPics.length}`,
                  prev: () => setOpen((o) => (o === null ? o : (o + chapterPics.length - 1) % chapterPics.length)),
                  next: () => setOpen((o) => (o === null ? o : (o + 1) % chapterPics.length)),
                }
              : undefined
          }
        />
      )}
    </>
  );
}
