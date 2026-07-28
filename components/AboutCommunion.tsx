"use client";

import { useI18n, type MessageKey } from "@/lib/i18n";
import BackToMenu from "@/components/BackToMenu";

export default function AboutCommunion() {
  const { t } = useI18n();
  return (
    <div>
      <BackToMenu />
      <h1 className="page-title">{t("settings.about")}</h1>
      <div className="glass card about-card">
        <blockquote className="founding-verse">
          {t("verse.matthew")}
          <cite>{t("verse.matthewRef")}</cite>
        </blockquote>
        <p>{t("about.p1")}</p>
        <p>{t("about.p2")}</p>
        <h3>{t("about.howTitle")}</h3>
        <ol className="about-list">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <li key={n}>{t(`about.how${n}` as MessageKey)}</li>
          ))}
        </ol>

        {/* What study mode offers, and the honest note about the underlines.
            That note used to sit above every chapter in the reader, which put
            a paragraph of small print between the reader and the first verse.
            It belongs with the rest of what the star turns on, where someone
            has come to read about the app rather than to read Scripture. */}
        <h3>{t("about.studyTitle")}</h3>
        <p>{t("about.studyIntro")}</p>
        <ul className="about-list">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <li key={n}>{t(`about.study${n}` as MessageKey)}</li>
          ))}
        </ul>
        <p className="about-fineprint">{t("about.studyUnderlines")}</p>

        <p className="notice">{t("about.footer")}</p>
      </div>
    </div>
  );
}
