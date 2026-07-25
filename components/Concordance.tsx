"use client";

// Every verse where an original-language word appears: the KJV occurrences
// of its Strong's number, plus Septuagint occurrences of the same Greek
// lemma. Opened from the word popup's "Found in N verses" button.

import { useEffect, useState } from "react";
import { getBook } from "@/lib/bible";
import { useI18n } from "@/lib/i18n";

export interface ConcordanceEntry {
  n: number;
  kjv: [number, number, number, string][];
  lxx?: [number, number, number][];
  lxxN?: number;
}

const BUCKET = 500;
const PAGE = 60;

export default function Concordance({
  num,
  lemma,
  translit,
  onPick,
  onClose,
}: {
  num: string;
  lemma: string;
  translit: string;
  onPick: (b: number, c: number, v: number) => void;
  onClose: () => void;
}) {
  const { lang, t } = useI18n();
  const [entry, setEntry] = useState<ConcordanceEntry | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<"kjv" | "lxx">("kjv");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    const prefix = num.slice(0, 1);
    const bucket = Math.floor(Number(num.slice(1)) / BUCKET);
    fetch(`/concordance/${prefix}${bucket}.json`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: Record<string, ConcordanceEntry>) => {
        if (data[num]) setEntry(data[num]);
        else setMissing(true);
      })
      .catch(() => setMissing(true));
  }, [num]);

  const bookName = (b: number) => {
    const book = getBook(b);
    return book ? (lang === "es" ? book.es : book.en) : "";
  };

  const rows =
    tab === "kjv"
      ? (entry?.kjv ?? []).map((r) => ({ b: r[0], c: r[1], v: r[2], word: r[3] }))
      : (entry?.lxx ?? []).map((r) => ({ b: r[0], c: r[1], v: r[2], word: "" }));
  const total = tab === "kjv" ? (entry?.n ?? 0) : (entry?.lxxN ?? 0);
  const hasLxx = (entry?.lxx?.length ?? 0) > 0;

  return (
    <div className="modal-overlay conc-overlay" onClick={onClose}>
      <div
        className="glass modal concordance"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lex-head">
          <span className="lex-lemma">{lemma || num}</span>
          <button
            type="button"
            className="lex-close"
            onClick={onClose}
            aria-label={t("search.close")}
          >
            ✕
          </button>
        </div>
        <p className="lex-meta">
          [{translit}] · {num}
        </p>

        {hasLxx && (
          <div className="plan-filters" style={{ marginTop: 8 }}>
            <button
              type="button"
              className={`chip${tab === "kjv" ? " chip-active" : ""}`}
              onClick={() => {
                setTab("kjv");
                setLimit(PAGE);
              }}
            >
              {t("reader.concKjv")} ({entry?.n ?? 0})
            </button>
            <button
              type="button"
              className={`chip${tab === "lxx" ? " chip-active" : ""}`}
              onClick={() => {
                setTab("lxx");
                setLimit(PAGE);
              }}
            >
              ☩ {t("reader.lxx")} ({entry?.lxxN ?? 0})
            </button>
          </div>
        )}

        {tab === "lxx" && (
          <p className="cal-hint">{t("reader.concLxxNote")}</p>
        )}

        {missing ? (
          <p className="notice">{t("reader.concEmpty")}</p>
        ) : !entry ? (
          <p className="skeleton">{t("common.loading")}</p>
        ) : (
          <>
            <div className="conc-list">
              {rows.slice(0, limit).map((r, i) => (
                <button
                  key={`${r.b}-${r.c}-${r.v}-${i}`}
                  type="button"
                  className="conc-row"
                  onClick={() => onPick(r.b, r.c, r.v)}
                >
                  <span className="conc-ref">
                    {bookName(r.b)} {r.c}:{r.v}
                  </span>
                  {r.word && <span className="conc-word">{r.word}</span>}
                </button>
              ))}
            </div>
            {rows.length > limit ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setLimit((n) => n + PAGE)}
              >
                {t("reader.concMore")}
              </button>
            ) : (
              total > rows.length && (
                <p className="cal-hint">
                  {t("reader.concCapped", {
                    shown: String(rows.length),
                    total: String(total),
                  })}
                </p>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
