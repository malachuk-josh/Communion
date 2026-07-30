"use client";

// A plan somebody sent you.
//
// Readable signed out, the way a shared collection is: the point of a link is
// that it opens. Taking a copy needs an account only because a plan you are
// walking has to live somewhere, and the button says so rather than the page
// refusing to load.
//
// What arrives is a copy and not a subscription. Once taken it is this
// reader's own plan with its own progress and its own hour, and the person
// who shared it cannot afterwards change what somebody else is reading.

import Link from "next/link";
import Icon from "@/components/Icon";
import { useEffect, useState } from "react";
import { getBook } from "@/lib/bible";
import { api } from "@/lib/client";
import { useI18n, type Lang } from "@/lib/i18n";
import type { Ref } from "@/lib/customPlanTypes";

interface Snapshot {
  name: string;
  sharedBy: string;
  days: Ref[][];
  updatedAt: number;
}

const bookName = (nr: number, lang: Lang) => {
  const book = getBook(nr);
  return book ? (lang === "es" ? book.es : book.en) : "";
};

export default function SharedPlan({ token }: { token: string }) {
  const { lang, t } = useI18n();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [gone, setGone] = useState(false);
  const [taking, setTaking] = useState(false);
  const [taken, setTaken] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/plans/shared/${token}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setSnap)
      .catch(() => setGone(true));
  }, [token]);

  const take = async () => {
    if (taking) return;
    setTaking(true);
    setError("");
    try {
      await api(`/api/plans/shared/${token}`, { method: "POST" });
      setTaken(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTaking(false);
    }
  };

  if (gone) {
    return (
      <div>
        <h1 className="page-title">{t("shared.planTitle")}</h1>
        <p className="glass card empty">{t("shared.planGone")}</p>
      </div>
    );
  }
  if (!snap) return <p className="skeleton">{t("common.loading")}</p>;

  return (
    <div>
      <h1 className="page-title">{snap.name}</h1>
      <p className="subtitle">
        {t("shared.planFrom", { name: snap.sharedBy })}{" "}
        {t("builder.days", { n: String(snap.days.length) })}
      </p>

      <div className="glass card">
        {taken ? (
          <p className="email-sent">
            <Icon name="party" /> {t("shared.planTaken")}{" "}
            <Link href="/menu/journal" className="passage-link">
              {t("nav.journal")} →
            </Link>
          </p>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={take}
            disabled={taking}
          >
            <Icon name="plan" />{" "}
            {taking ? t("common.loading") : t("shared.planTake")}
          </button>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>

      {/* The whole plan, day by day. A plan is a commitment of weeks and
          nobody should have to take one to find out what is in it. */}
      <ol className="builder-list shared-plan-list">
        {snap.days.map((day, i) => (
          <li key={i}>
            <span className="builder-day-n">{i + 1}</span>
            <span>
              {day.map(([b, c], j) => (
                <span key={j}>
                  {j > 0 && " · "}
                  <Link href={`/?b=${b}&c=${c}`} className="passage-link">
                    {bookName(b, lang)} {c}
                  </Link>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
