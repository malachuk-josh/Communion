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
        <p className="notice">{t("about.footer")}</p>
      </div>
    </div>
  );
}
