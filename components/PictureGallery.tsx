"use client";

// The Picture Bible, in Discover: the illustrated Bible gathered into its
// stories — the life of David, the life of Christ, Paul's journeys — and the
// study pictures of the Tabernacle and the Temples and of daily life beside
// them. /pictures is the shelf of them all; /pictures?s=<story> one story, in
// its order and under its parts; s=all every picture book by book.
//
// A tap opens a picture full screen, with the story's others a swipe away
// and a way to the passage it shows.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import PictureViewer, { type PictureCaption } from "@/components/PictureViewer";
import { BOOKS } from "@/lib/bible";
import { artLabel, artOf, loadBibleArt, passageLabel, type BibleArt, type Story } from "@/lib/bibleArt";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { parsePassage } from "@/lib/passage";
import { loadStudyArt, studySet, type StudyArt, type StudyIndex } from "@/lib/studyArt";

type BibleIndex = NonNullable<Awaited<ReturnType<typeof loadBibleArt>>>;

/** One picture as the gallery shows it, whichever library it is from. */
interface Tile {
  id: string;
  title: string;
  ref: string;
  src: string;
  full: string;
  alt: string;
  w: number;
  h: number;
  caption: PictureCaption;
  diagram?: boolean;
}

const STUDY_SETS = ["architecture", "world"] as const;

export default function PictureGallery() {
  const { lang, t } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const shelf = params.get("s");
  const [bible, setBible] = useState<BibleIndex | null>(null);
  const [study, setStudy] = useState<StudyIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([loadBibleArt(), loadStudyArt()]).then(([b, s]) => {
      setBible(b);
      setStudy(s);
      if (!b && !s) setFailed(true);
    });
  }, []);
  useEffect(() => setOpen(null), [shelf]);

  const bookName = (nr: number) => {
    const b = BOOKS.find((x) => x.nr === nr);
    return b ? (lang === "es" ? b.es : b.en) : "";
  };
  const storyName = (id: string) => t(`pics.story.${id}` as MessageKey);
  const passageHref = (b: number, c: number, v?: number) => `/?b=${b}&c=${c}${v ? `&v=${v}` : ""}`;

  const fromBible = (a: BibleArt): Tile => {
    const { label, sub } = artLabel(a, lang, bookName);
    return {
    id: a.id,
    title: label,
    ref: sub ?? "",
    src: a.src,
    full: a.full,
    alt: a.alt,
    w: a.w,
    h: a.h,
    caption: {
      title: label,
      refs: passageLabel(a, bookName),
      note: [a.note, t("pics.illustrationNote")].filter(Boolean).join(" "),
      go: { label: t("pics.read"), href: passageHref(a.b, a.c, a.v) },
    },
    };
  };
  const fromStudy = (a: StudyArt): Tile => {
    const at = a.refs.map((r) => parsePassage(r)).find(Boolean);
    return {
      id: a.id,
      title: a.title,
      ref: a.refs[0] ?? "",
      src: a.src,
      full: a.full,
      alt: a.alt,
      w: a.w,
      h: a.h,
      diagram: a.type === "diagram",
      caption: {
        title: a.title,
        kind: a.type === "diagram" ? t("reader.studyDiagram") : t("reader.studyReconstruction"),
        refs: a.refs.join("; "),
        period: a.period,
        note: a.note,
        sources: a.sources,
        go: at ? { label: t("pics.read"), href: passageHref(at.bookNr, at.chapter, at.verse) } : undefined,
      },
    };
  };

  /** The shelf being looked at: its pictures, under headings where it has parts. */
  const view = useMemo((): { title: string; groups: { head?: string; tiles: Tile[] }[] } | null => {
    if (!shelf) return null;
    if (STUDY_SETS.includes(shelf as (typeof STUDY_SETS)[number])) {
      if (!study) return null;
      return {
        title: t(`pics.set.${shelf}` as MessageKey),
        groups: [{ tiles: studySet(study, shelf as StudyArt["set"]).map(fromStudy) }],
      };
    }
    if (!bible) return null;
    if (shelf === "all") {
      const byBook = new Map<number, Tile[]>();
      const all = Object.keys(bible.items)
        .map((id) => artOf(bible, id)!)
        .sort((a, b) => a.b - b.b || a.c - b.c || a.v - b.v);
      for (const a of all) byBook.set(a.b, [...(byBook.get(a.b) ?? []), fromBible(a)]);
      return {
        title: t("pics.all"),
        groups: [...byBook].map(([b, tiles]) => ({ head: bookName(b), tiles })),
      };
    }
    const story = bible.stories.find((s) => s.id === shelf);
    if (!story) return null;
    const groups: { head?: string; tiles: Tile[] }[] = [];
    for (const [id, part] of story.parts) {
      const a = artOf(bible, id);
      if (!a) continue;
      if (!groups.length || groups[groups.length - 1].head !== part) groups.push({ head: part, tiles: [] });
      groups[groups.length - 1].tiles.push(fromBible(a));
    }
    return { title: storyName(story.id), groups };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelf, bible, study, lang]);

  const flat = view?.groups.flatMap((g) => g.tiles) ?? [];
  const shown = open === null ? null : flat[open];

  // ---- one shelf ----------------------------------------------------------------
  if (shelf) {
    return (
      <div className="pics">
        <Link href="/pictures" className="passage-link back-link">
          ← {t("pics.title")}
        </Link>
        <h1 className="page-title">{view?.title ?? t("pics.title")}</h1>
        {!view && !failed && <p className="skeleton">{t("common.loading")}</p>}
        {failed && <p className="cal-hint">{t("pics.offline")}</p>}
        {view &&
          view.groups.map((g, gi) => (
            <section key={gi} className="pics-group">
              {g.head && <h2 className="pics-head">{g.head}</h2>}
              <div className="pics-grid">
                {g.tiles.map((tile) => {
                  const i = flat.indexOf(tile);
                  return (
                    <button
                      key={tile.id}
                      type="button"
                      className={`pics-tile${tile.diagram ? " diagram" : ""}`}
                      onClick={() => setOpen(i)}
                    >
                      <img src={tile.src} alt={tile.alt} loading="lazy" width={tile.w} height={tile.h} />
                      <span className="pics-tile-title">{tile.title}</span>
                      {tile.ref && <span className="pics-tile-ref">{tile.ref}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        {view && (
          <p className="study-note">
            {STUDY_SETS.includes(shelf as (typeof STUDY_SETS)[number]) ? t("reader.studyNote") : t("pics.lead")}
          </p>
        )}
        {shown && (
          <PictureViewer
            key={shown.id}
            src={shown.src}
            full={shown.full}
            alt={shown.alt}
            onClose={() => setOpen(null)}
            caption={shown.caption}
            step={
              flat.length > 1
                ? {
                    at: `${open! + 1} / ${flat.length}`,
                    prev: () => setOpen((o) => (o === null ? o : (o + flat.length - 1) % flat.length)),
                    next: () => setOpen((o) => (o === null ? o : (o + 1) % flat.length)),
                  }
                : undefined
            }
          />
        )}
      </div>
    );
  }

  // ---- the shelf of them all ---------------------------------------------------------
  const cover = (story: Story) => (bible ? artOf(bible, story.cover) : null);
  const studyCover = (set: StudyArt["set"]) => (study ? studySet(study, set)[0] : undefined);
  const count = (n: number) => t("pics.count", { n: String(n) });

  return (
    <div className="pics">
      <Link href="/discover" className="passage-link back-link">
        ← {t("discover.title")}
      </Link>
      <h1 className="page-title">
        <Icon name="picture" /> {t("pics.title")}
      </h1>
      <p className="subtitle">{t("pics.lead")}</p>
      {!bible && !study && !failed && <p className="skeleton">{t("common.loading")}</p>}
      {failed && <p className="cal-hint">{t("pics.offline")}</p>}

      {bible && (
        <section className="pics-group">
          <h2 className="pics-head">{t("pics.stories")}</h2>
          <div className="pics-shelf">
            {bible.stories.map((s) => {
              const c = cover(s);
              return (
                <button key={s.id} type="button" className="glass card pics-story" onClick={() => router.push(`/pictures?s=${s.id}`)}>
                  {c && <img src={c.src} alt="" loading="lazy" width={c.w} height={c.h} />}
                  <span className="pics-story-name">{storyName(s.id)}</span>
                  <span className="pics-story-count">{count(s.parts.length)}</span>
                </button>
              );
            })}
            <button type="button" className="glass card pics-story" onClick={() => router.push("/pictures?s=all")}>
              {(() => {
                // the first picture in the Bible
                const c = artOf(bible, Object.keys(bible.items)[0]);
                return c ? <img src={c.src} alt="" loading="lazy" width={c.w} height={c.h} /> : null;
              })()}
              <span className="pics-story-name">{t("pics.all")}</span>
              <span className="pics-story-count">{count(Object.keys(bible.items).length)}</span>
            </button>
          </div>
        </section>
      )}

      {study && (
        <section className="pics-group">
          <h2 className="pics-head">{t("pics.study")}</h2>
          <div className="pics-shelf">
            {STUDY_SETS.map((set) => {
              const c = studyCover(set);
              return (
                <button key={set} type="button" className="glass card pics-story" onClick={() => router.push(`/pictures?s=${set}`)}>
                  {c && <img src={c.src} alt="" loading="lazy" width={c.w} height={c.h} />}
                  <span className="pics-story-name">{t(`pics.set.${set}` as MessageKey)}</span>
                  <span className="pics-story-count">{count(studySet(study, set).length)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
