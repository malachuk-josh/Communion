"use client";

// Shared attachment picker: type a scripture reference, or pick one of your
// bookmarks or notes. Used by fellowship discussion threads.

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { getBook } from "@/lib/bible";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import { parsePassage } from "@/lib/passage";

export interface Attach {
  b: number;
  c: number;
  v?: number;
  kind: "verse" | "bookmark" | "note" | "word";
  label?: string;
}

export function attachRef(a: Attach, es: boolean): string {
  const book = getBook(a.b);
  const name = book ? (es ? book.es : book.en) : "";
  return `${name} ${a.c}${a.v ? `:${a.v}` : ""}`;
}

export default function AttachPicker({
  onPick,
}: {
  onPick: (a: Attach) => void;
}) {
  const { lang, t } = useI18n();
  const [ref, setRef] = useState("");
  const [items, setItems] = useState<Attach[] | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ bookmarks: Record<string, { t: number; l?: string }> }>(
        "/api/bookmarks"
      ).catch(() => ({ bookmarks: {} })),
      api<{ notes: { b: number; c: number; v: number; text: string }[] }>(
        "/api/notes"
      ).catch(() => ({ notes: [] })),
    ]).then(([bm, nt]) => {
      const list: Attach[] = [];
      for (const [key, entry] of Object.entries(bm.bookmarks)) {
        const [b, c, v] = key.split(":").map(Number);
        list.push({ b, c, v, kind: "bookmark", label: entry.l });
      }
      for (const n of nt.notes) {
        list.push({ b: n.b, c: n.c, v: n.v, kind: "note", label: n.text });
      }
      list.sort((a, b) => a.b - b.b || a.c - b.c || (a.v ?? 0) - (b.v ?? 0));
      setItems(list);
    });
  }, []);

  const location = parsePassage(ref);
  const parsed: Attach | null = location
    ? {
        b: location.bookNr,
        c: location.chapter,
        ...(location.verse ? { v: location.verse } : {}),
        kind: "verse",
      }
    : null;

  return (
    <div className="attach-picker">
      <div className="coll-new">
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder={t("threads.refPlaceholder")}
          maxLength={60}
          onKeyDown={(e) => {
            if (e.key === "Enter" && parsed) {
              onPick(parsed);
              setRef("");
            }
          }}
        />
        <button
          type="button"
          className="btn btn-sm"
          disabled={!parsed}
          onClick={() => {
            if (!parsed) return;
            onPick(parsed);
            setRef("");
          }}
        >
          ＋
        </button>
      </div>
      {ref.trim() && !parsed && (
        <p className="cal-hint">{t("threads.refUnknown")}</p>
      )}
      {items === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <p className="cal-hint">{t("messages.shareEmpty")}</p>
      ) : (
        <div className="share-list">
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              className="share-row"
              onClick={() => onPick(item)}
            >
              <span><Icon name={item.kind === "note" ? "note" : "bookmark"} /></span>
              <span className="share-row-body">
                <strong>{attachRef(item, lang === "es")}</strong>
                {item.label && <small>{item.label}</small>}
              </span>
              <span className="menu-tile-arrow">＋</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
