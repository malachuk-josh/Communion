"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n, type MessageKey } from "@/lib/i18n";
import type { Church, Role } from "@/lib/types";

type MyChurch = Church & { myRole: Role; memberCount: number };

export default function Settings() {
  const { lang, setLang, t } = useI18n();
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [churches, setChurches] = useState<MyChurch[] | null>(null);

  useEffect(() => {
    setTheme(
      document.documentElement.dataset.theme === "light" ? "light" : "dark"
    );
    api<{ churches: MyChurch[] }>("/api/churches")
      .then((res) => setChurches(res.churches))
      .catch(() => setChurches([]));
  }, []);

  const applyTheme = (next: "dark" | "light") => {
    setTheme(next);
    if (next === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    window.localStorage.setItem("communion.theme", next);
  };

  const toggleVisibility = async (church: MyChurch) => {
    const next = church.visibility === "private" ? "public" : "private";
    setChurches(
      (prev) =>
        prev?.map((c) =>
          c.id === church.id ? { ...c, visibility: next } : c
        ) ?? null
    );
    try {
      await api(`/api/churches/${church.id}`, {
        method: "PATCH",
        body: { visibility: next },
      });
    } catch {
      // revert on failure
      setChurches(
        (prev) =>
          prev?.map((c) =>
            c.id === church.id ? { ...c, visibility: church.visibility } : c
          ) ?? null
      );
    }
  };

  return (
    <div>
      <h1 className="page-title">{t("settings.title")}</h1>
      <p className="subtitle">{t("settings.subtitle")}</p>

      <div className="section-head">
        <h2>{t("settings.preferences")}</h2>
      </div>
      <div className="glass card">
        <div className="pref-row">
          <span>{t("settings.language")}</span>
          <div className="lang-toggle" role="group">
            <button
              className={lang === "en" ? "active" : ""}
              onClick={() => setLang("en")}
            >
              English
            </button>
            <button
              className={lang === "es" ? "active" : ""}
              onClick={() => setLang("es")}
            >
              Español
            </button>
          </div>
        </div>
        <div className="pref-row">
          <span>{t("settings.theme")}</span>
          <div className="lang-toggle" role="group">
            <button
              className={theme === "light" ? "active" : ""}
              onClick={() => applyTheme("light")}
            >
              ☀️ {t("settings.themeLight")}
            </button>
            <button
              className={theme === "dark" ? "active" : ""}
              onClick={() => applyTheme("dark")}
            >
              🌙 {t("settings.themeDark")}
            </button>
          </div>
        </div>
      </div>

      <div className="section-head">
        <h2>{t("settings.myChurches")}</h2>
      </div>
      {churches === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : churches.length === 0 ? (
        <div className="glass card empty">{t("churches.empty")}</div>
      ) : (
        churches.map((church) => (
          <div key={church.id} className="glass card settings-church">
            <div className="settings-church-head">
              <div>
                <h3>{church.name}</h3>
                <p className="session-meta">
                  {church.myRole === "founder"
                    ? `★ ${t("churches.founder")}`
                    : t("discover.mine")}
                  {" · "}
                  {t("discover.members", {
                    count: String(church.memberCount),
                  })}
                  {" · "}
                  {church.visibility === "private"
                    ? `🔒 ${t("churches.privateBadge")}`
                    : `🌐 ${t("settings.public")}`}
                </p>
              </div>
              <Link href={`/churches/${church.id}`} className="btn btn-sm">
                {t("settings.open")} →
              </Link>
            </div>
            {church.myRole === "founder" && (
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={church.visibility === "private"}
                  onChange={() => toggleVisibility(church)}
                />
                🔒 {t("churches.privateLabel")}
              </label>
            )}
          </div>
        ))
      )}
      <p className="notice">{t("settings.membersHint")}</p>

      <div className="section-head">
        <h2>{t("settings.about")}</h2>
      </div>
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
