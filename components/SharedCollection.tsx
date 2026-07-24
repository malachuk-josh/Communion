"use client";

// Public view of a shared bookmark collection: verse texts (KJV) with the
// sharer's labels, each deep-linking into The Word.

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBook, type ChapterData } from "@/lib/bible";
import { useI18n } from "@/lib/i18n";

interface SharedVerse {
  b: number;
  c: number;
  v: number;
  label?: string;
}

interface Snapshot {
  name: string;
  sharedBy?: string;
  verses: SharedVerse[];
}

export default function SharedCollection({ token }: { token: string }) {
  const { lang, t } = useI18n();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [texts, setTexts] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`/api/shared/${token}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setSnap)
      .catch(() => setInvalid(true));
  }, [token]);

  useEffect(() => {
    if (!snap) return;
    const chapters = [...new Set(snap.verses.map((x) => `${x.b}:${x.c}`))];
    chapters.forEach((ch) => {
      const [b, c] = ch.split(":").map(Number);
      fetch(`/api/bible/kjv/${b}/${c}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((json: ChapterData) => {
          setTexts((prev) => {
            const next = { ...prev };
            for (const verse of json.verses) {
              next[`${b}:${c}:${verse.verse}`] = verse.text;
            }
            return next;
          });
        })
        .catch(() => {});
    });
  }, [snap]);

  if (invalid) {
    return <p className="empty glass card">{t("shared.invalid")}</p>;
  }
  if (!snap) {
    return <p className="skeleton">{t("common.loading")}</p>;
  }

  const refLabel = (x: SharedVerse) => {
    const book = getBook(x.b);
    const name = book ? (lang === "es" ? book.es : book.en) : "";
    return `${name} ${x.c}:${x.v}`;
  };

  return (
    <div>
      <h1 className="page-title">🔖 {snap.name}</h1>
      <p className="subtitle">
        {snap.sharedBy
          ? t("shared.by", { name: snap.sharedBy })
          : t("shared.subtitle")}
      </p>
      {snap.verses.length === 0 ? (
        <div className="glass card empty">{t("shared.empty")}</div>
      ) : (
        snap.verses.map((x) => {
          const key = `${x.b}:${x.c}:${x.v}`;
          return (
            <Link
              key={key}
              href={`/?b=${x.b}&c=${x.c}&v=${x.v}`}
              className="glass card shared-verse"
            >
              <span className="ref">{refLabel(x)}</span>
              {x.label && <span className="shared-label">{x.label}</span>}
              <p>{texts[key] ?? "…"}</p>
            </Link>
          );
        })
      )}
      <p className="notice">{t("shared.footer")}</p>
    </div>
  );
}
