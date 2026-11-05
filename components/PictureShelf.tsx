"use client";

// The Picture Bible's place in Discover: a row of its stories, each opening
// in the gallery (/pictures), and the way to the rest of it.

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { artOf, loadBibleArt } from "@/lib/bibleArt";
import { useI18n, type MessageKey } from "@/lib/i18n";

type BibleIndex = NonNullable<Awaited<ReturnType<typeof loadBibleArt>>>;

export default function PictureShelf() {
  const { t } = useI18n();
  const [bible, setBible] = useState<BibleIndex | null>(null);

  useEffect(() => {
    let live = true;
    loadBibleArt().then((b) => live && setBible(b));
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="shelf pics-discover" aria-labelledby="pics-title">
      <div className="section-head">
        <h2 id="pics-title">
          <Icon name="picture" /> {t("pics.title")}
        </h2>
        <Link href="/pictures" className="see-all">
          {t("pics.seeAll")}
        </Link>
      </div>
      <p className="subtitle plans-lead">{t("pics.lead")}</p>
      <div className="shelf-row">
        {(bible?.stories ?? []).map((s) => {
          const c = artOf(bible!, s.cover);
          return (
            <Link key={s.id} href={`/pictures?s=${s.id}`} className="glass card pics-story">
              {c && <img src={c.src} alt="" loading="lazy" width={c.w} height={c.h} />}
              <span className="pics-story-name">{t(`pics.story.${s.id}` as MessageKey)}</span>
              <span className="pics-story-count">{t("pics.count", { n: String(s.parts.length) })}</span>
            </Link>
          );
        })}
        <Link href="/pictures" className="glass card pics-story pics-more">
          <span className="pics-story-name">
            <Icon name="picture" /> {t("pics.seeAll")}
          </span>
          <span className="pics-story-count">{t("pics.moreLead")}</span>
        </Link>
      </div>
    </section>
  );
}
