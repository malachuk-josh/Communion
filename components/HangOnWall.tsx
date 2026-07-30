"use client";

// The pill that puts a verse on a wall.
//
// One control, two kinds of destination: the reader's own wall, which sits on
// their home screen, and the wall of any Gathering they belong to. They are
// listed together because from where the reader stands they are the same
// decision — where should this hang? — and splitting them into two controls
// would make a distinction the reader is not making.
//
// The list is fetched when the menu opens rather than when the page loads:
// most bookmarks are never hung, and asking which Gatherings somebody belongs
// to on the chance that they might is a request per bookmark row.
//
// Two ways of showing that list, because there are two places this appears.
// In a row of icon buttons it floats over the page, the way a menu does. In
// the reader's bookmark sheet it opens in the flow instead: the sheet is a
// scroll container, and anything absolutely positioned inside one is clipped
// at its edge — the menu was there, drawn, and unreachable below the fold.

import Icon from "@/components/Icon";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import type { Church } from "@/lib/types";

export default function HangOnWall({
  bmKey,
  className = "jr-share",
  withLabel = false,
  inline = false,
}: {
  /** the bookmark key of the verse or run being hung */
  bmKey: string;
  className?: string;
  /** the sheet has room for a word; a row of icons does not */
  withLabel?: boolean;
  /** open the list in the flow rather than over the page — see above */
  inline?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<Church[] | null>(null);
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open || mine !== null) return;
    api<{ churches: Church[] }>("/api/churches")
      .then((res) => setMine(res.churches))
      .catch(() => setMine([]));
  }, [open, mine]);

  // A tap anywhere else puts the menu away, the way every other menu behaves.
  // Not while it is open in the flow: there it is part of the sheet rather
  // than something over it, and reaching past it to the note or a collection
  // chip should not have to be done twice.
  useEffect(() => {
    if (!open || inline) return;
    const away = (e: MouseEvent | TouchEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("touchstart", away);
    };
  }, [open, inline]);

  const hang = async (churchId: string | null, name: string) => {
    setBusy(churchId ?? "mine");
    setError("");
    try {
      await api(churchId ? `/api/churches/${churchId}/wall` : "/api/wall", {
        method: "POST",
        body: { key: bmKey },
      });
      setDone(name);
      setOpen(false);
      window.setTimeout(() => setDone(""), 2600);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const items = (
    <>
      <p className="cal-label">{t("wall.where")}</p>
      <button
        type="button"
        role="menuitem"
        className="hang-item"
        disabled={busy !== ""}
        onClick={() => hang(null, t("wall.mine"))}
      >
        <Icon name="wall" /> {t("wall.mine")}
      </button>
      {mine === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : mine.length === 0 ? (
        <p className="cal-hint">{t("wall.noGatherings")}</p>
      ) : (
        mine.map((church) => (
          <button
            key={church.id}
            type="button"
            role="menuitem"
            className="hang-item"
            disabled={busy !== ""}
            onClick={() => hang(church.id, church.name)}
          >
            <Icon name="church" /> {church.name}
          </button>
        ))
      )}
    </>
  );

  return (
    <span className={`hang-wrap${inline ? " hang-inline" : ""}`} ref={box}>
      <button
        type="button"
        className={className}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("wall.hang")}
        title={t("wall.hang")}
      >
        <Icon name="wall" />
        {withLabel && ` ${t("wall.hang")}`}
      </button>

      {done && <span className="hang-done">{t("wall.hung", { name: done })}</span>}
      {error && <span className="error-text hang-done">{error}</span>}

      {open && (
        <div className={inline ? "hang-list" : "hang-menu glass"} role="menu">
          {items}
        </div>
      )}
    </span>
  );
}
