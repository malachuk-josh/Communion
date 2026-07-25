"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { fetchChapter } from "@/lib/scripture";
import { getBook, type Verse } from "@/lib/bible";
import { verseOfTheDay, type VerseRef } from "@/lib/devotional";
import { PLANS, PLAN_CATEGORIES } from "@/lib/plans";
import { TOPICS, type Topic } from "@/lib/topics";
import { useI18n, type Lang, type MessageKey } from "@/lib/i18n";
import StartGathering from "@/components/StartGathering";
import type { DiscoverChurch, SessionType, WorshipEvent } from "@/lib/types";

const EMOJI: Record<SessionType, string> = {
  bible_study: "📖",
  prayer: "🙏",
  communion: "🍞",
  praise_worship: "🎶",
  fellowship: "🤝",
  custom: "✨",
};

type Gathering = WorshipEvent & { churchName: string };

function refLabel(ref: VerseRef, lang: Lang): string {
  const book = getBook(ref.b);
  const name = book ? (lang === "es" ? book.es : book.en) : "";
  return `${name} ${ref.c}:${ref.v}${ref.ve ? `–${ref.ve}` : ""}`;
}

export default function Discover() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"scripture" | "gatherings">("scripture");
  const [churches, setChurches] = useState<DiscoverChurch[] | null>(null);
  const [gatherings, setGatherings] = useState<Gathering[]>([]);

  useEffect(() => {
    api<{ churches: DiscoverChurch[]; gatherings: Gathering[] }>("/api/discover")
      .then((res) => {
        setChurches(res.churches);
        setGatherings(res.gatherings ?? []);
      })
      .catch(() => setChurches([]));
  }, []);

  return (
    <div>
      <h1 className="page-title">{t("discover.title")}</h1>
      {/* two things worth discovering: the Word, and the people reading it */}
      <div className="lang-toggle discover-tabs" role="group">
        <button
          className={tab === "scripture" ? "active" : ""}
          onClick={() => setTab("scripture")}
          aria-pressed={tab === "scripture"}
        >
          📖 {t("discover.tabScripture")}
        </button>
        <button
          className={tab === "gatherings" ? "active" : ""}
          onClick={() => setTab("gatherings")}
          aria-pressed={tab === "gatherings"}
        >
          ⛪ {t("discover.tabGatherings")}
        </button>
      </div>
      <p className="subtitle">
        {tab === "scripture"
          ? t("discover.subtitleScripture")
          : t("discover.subtitle")}
      </p>

      {tab === "scripture" ? (
        <>
          <VerseOfDay />
          <TopicsSection />
          <PlansSection />
        </>
      ) : (
        <>
          <GatheringsSection gatherings={gatherings} />
          <ChurchDirectory churches={churches} />
          <div className="discover-start">
            <StartGathering
              className="btn btn-primary"
              // new Gatherings start public, so it belongs in the directory
              onCreated={(church) =>
                setChurches((prev) => [
                  { ...church, memberCount: 1, mine: true },
                  ...(prev ?? []),
                ])
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

function VerseOfDay() {
  const { lang, t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ref = useMemo(() => verseOfTheDay(), []);
  const label = refLabel(ref, lang);

  useEffect(() => {
    const translation = lang === "es" ? "valera" : "kjv";
    fetchChapter(translation, ref.b, ref.c)
      .then((json: { verses: Verse[] }) => {
        const last = ref.ve ?? ref.v;
        const picked = json.verses.filter(
          (v) => v.verse >= ref.v && v.verse <= last
        );
        setText(picked.map((v) => v.text).join(" "));
      })
      .catch(() => setText(null));
  }, [lang, ref]);

  const share = async () => {
    const payload = `"${text}" — ${label}`;
    try {
      if (navigator.share) {
        await navigator.share({ text: payload });
      } else {
        await navigator.clipboard.writeText(payload);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // share sheet dismissed
    }
  };

  return (
    <div className="glass card votd">
      <p className="votd-label">☀️ {t("discover.votd")}</p>
      {text === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : (
        <>
          <blockquote className="votd-text">“{text}”</blockquote>
          <p className="votd-ref">{label}</p>
          <div className="votd-actions">
            <Link
              className="btn btn-sm btn-primary"
              href={`/?b=${ref.b}&c=${ref.c}&v=${ref.v}`}
            >
              📖 {t("discover.openReader")}
            </Link>
            <button className="btn btn-sm" onClick={share}>
              📤 {copied ? t("churches.copied") : t("discover.share")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TopicsSection() {
  const { lang, t } = useI18n();
  const [open, setOpen] = useState<Topic | null>(null);

  return (
    <>
      <div className="section-head">
        <h2>{t("discover.topics")}</h2>
      </div>
      <div className="topic-grid">
        {TOPICS.map((topic) => (
          <button
            key={topic.id}
            className="type-card"
            onClick={() => setOpen(topic)}
          >
            <span className="emoji">{topic.emoji}</span>
            <span className="name">
              {t(`topic.${topic.id}` as MessageKey)}
            </span>
          </button>
        ))}
      </div>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(null)}>
          <div className="glass modal" onClick={(e) => e.stopPropagation()}>
            <h2>
              {open.emoji} {t(`topic.${open.id}` as MessageKey)}
            </h2>
            <div className="topic-list">
              {open.passages.map((ref, i) => (
                <Link
                  key={i}
                  className="glass search-result"
                  href={`/?b=${ref.b}&c=${ref.c}&v=${ref.v}`}
                  onClick={() => setOpen(null)}
                >
                  <span className="ref">📖 {refLabel(ref, lang)}</span>
                </Link>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setOpen(null)}>
                {t("session.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PlansSection() {
  const { lang, t } = useI18n();
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    api<{ progress: Record<string, number> }>("/api/plans/progress")
      .then((res) => setProgress(res.progress))
      .catch(() => {});
  }, []);

  const complete = async (planId: string) => {
    if (busy) return;
    setBusy(planId);
    try {
      const res = await api<{ completed: number }>(`/api/plans/${planId}`, {
        method: "POST",
        body: { action: "complete" },
      });
      setProgress((prev) => ({ ...prev, [planId]: res.completed }));
    } catch {
      // signed-out in Clerk mode — progress needs an account
    } finally {
      setBusy(null);
    }
  };

  const reset = async (planId: string) => {
    try {
      await api(`/api/plans/${planId}`, {
        method: "POST",
        body: { action: "reset" },
      });
      setProgress((prev) => ({ ...prev, [planId]: 0 }));
    } catch {
      // ignore
    }
  };

  const started = PLANS.filter(
    (p) => (progress[p.id] ?? 0) > 0 && (progress[p.id] ?? 0) < p.days.length
  );
  const shown =
    filter === "mine"
      ? started
      : filter === "all"
        ? PLANS
        : PLANS.filter((p) => p.category === filter);

  const dayLabel = (day: { readings: { b: number; c: number }[] }) => {
    const refs = day.readings.map((r) =>
      refLabel({ ...r, v: 1 }, lang).replace(/:1$/, "")
    );
    return refs.length <= 2 ? refs.join(" · ") : `${refs[0]} – ${refs.at(-1)}`;
  };

  return (
    <>
      <div className="section-head">
        <h2>{t("discover.plans")}</h2>
      </div>
      <p className="subtitle plans-lead">{t("discover.plansLead")}</p>
      <div className="plan-filters">
        {(["all", ...PLAN_CATEGORIES] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={`chip${filter === key ? " chip-active" : ""}`}
            onClick={() => setFilter(key)}
          >
            {t(`planCat.${key}` as MessageKey)}
          </button>
        ))}
        {started.length > 0 && (
          <button
            type="button"
            className={`chip${filter === "mine" ? " chip-active" : ""}`}
            onClick={() => setFilter("mine")}
          >
            ▶ {t("discover.planMine")} ({started.length})
          </button>
        )}
      </div>
      <div className="plan-grid">
        {shown.map((plan) => {
          const done = progress[plan.id] ?? 0;
          const total = plan.days.length;
          const finished = done >= total;
          const today = finished ? null : plan.days[done];
          return (
            <div key={plan.id} className="glass card plan-card">
              <div className="plan-head">
                <h3>
                  {plan.emoji} {t(`plan.${plan.id}` as MessageKey)}
                </h3>
                <span className="plan-count">
                  {done}/{total}
                </span>
              </div>
              <p className="plan-desc">
                {t(`plan.${plan.id}.desc` as MessageKey)}
              </p>
              <p className="plan-meta">
                {t("discover.planLength", { n: String(total) })}
              </p>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.round((done / total) * 100)}%` }}
                />
              </div>
              {finished ? (
                <div className="plan-actions">
                  <span className="email-sent">🎉 {t("discover.planDone")}</span>
                  <button className="rsvp-btn" onClick={() => reset(plan.id)}>
                    {t("discover.restart")}
                  </button>
                </div>
              ) : (
                today && (
                  <div className="plan-actions">
                    <Link
                      className="cal-link"
                      href={`/?b=${today.readings[0].b}&c=${today.readings[0].c}`}
                    >
                      📖 {t("discover.day", { n: String(done + 1) })}:{" "}
                      {dayLabel(today)}
                    </Link>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => complete(plan.id)}
                      disabled={busy === plan.id}
                    >
                      ✓ {t("discover.markRead")}
                    </button>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function GatheringsSection({ gatherings }: { gatherings: Gathering[] }) {
  const { lang, t } = useI18n();
  if (gatherings.length === 0) return null;
  return (
    <>
      <div className="section-head">
        <h2>{t("discover.gatherings")}</h2>
      </div>
      {gatherings.map((event) => {
        const when = new Date(event.startsAt).toLocaleString(
          lang === "es" ? "es" : "en",
          {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }
        );
        return (
          <Link
            key={event.id}
            href={`/churches/${event.churchId}`}
            className="glass session gathering-row"
          >
            <span className="session-icon">{EMOJI[event.type]}</span>
            <div className="session-body">
              <h3>{event.title}</h3>
              <p className="session-meta">
                ⛪ {event.churchName} · {when}
              </p>
            </div>
          </Link>
        );
      })}
    </>
  );
}

function ChurchDirectory({ churches }: { churches: DiscoverChurch[] | null }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"new" | "big">("new");

  const filtered = useMemo(() => {
    if (!churches) return null;
    const q = query.trim().toLowerCase();
    const list = churches.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
    return [...list].sort((a, b) =>
      sort === "big" ? b.memberCount - a.memberCount : b.createdAt - a.createdAt
    );
  }, [churches, query, sort]);

  return (
    <>
      <div className="section-head">
        <h2>{t("discover.churches")}</h2>
        <div className="lang-toggle" role="group">
          <button
            className={sort === "new" ? "active" : ""}
            onClick={() => setSort("new")}
          >
            {t("discover.sortNew")}
          </button>
          <button
            className={sort === "big" ? "active" : ""}
            onClick={() => setSort("big")}
          >
            {t("discover.sortBig")}
          </button>
        </div>
      </div>
      <div className="glass search-bar">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("discover.searchChurches")}
          maxLength={60}
        />
        <span aria-hidden>🔍</span>
      </div>

      {filtered === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : filtered.length === 0 ? (
        <div className="glass card empty">
          <blockquote className="founding-verse">
            {t("verse.matthew")}
            <cite>{t("verse.matthewRef")}</cite>
          </blockquote>
          <p>{t("discover.empty")}</p>
        </div>
      ) : (
        filtered.map((church) => (
          <Link
            key={church.id}
            href={`/churches/${church.id}`}
            className="glass church-row card"
          >
            <div className="discover-head">
              <h3>{church.name}</h3>
              <span className="discover-badges">
                {church.mine && (
                  <span className="chip mine-chip">✓ {t("discover.mine")}</span>
                )}
                <span className="chip">
                  👥 {t("discover.members", { count: String(church.memberCount) })}
                </span>
              </span>
            </div>
            {church.description && <p>{church.description}</p>}
          </Link>
        ))
      )}
    </>
  );
}
