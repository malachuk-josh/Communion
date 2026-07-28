"use client";

import Link from "next/link";
import Icon, { SESSION_ICON } from "@/components/Icon";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { readOutbox } from "@/lib/localStore";
import {
  adoptIdentity,
  enqueue,
  flush,
  readLocalState,
  startSync,
  writeLocalState,
} from "@/lib/sync";
import { fetchChapter } from "@/lib/scripture";
import { getBook, type Verse } from "@/lib/bible";
import { verseOfTheDay, type VerseRef } from "@/lib/devotional";
import { PLANS, PLAN_CATEGORIES } from "@/lib/plans";
import { TOPICS, type Topic } from "@/lib/topics";
import PrayerList from "@/components/PrayerList";
import { useI18n, type Lang, type MessageKey } from "@/lib/i18n";
import StartGathering from "@/components/StartGathering";
import type { DiscoverChurch, SessionType, WorshipEvent } from "@/lib/types";



type Gathering = WorshipEvent & { churchName: string };

function refLabel(ref: VerseRef, lang: Lang): string {
  const book = getBook(ref.b);
  const name = book ? (lang === "es" ? book.es : book.en) : "";
  return `${name} ${ref.c}:${ref.v}${ref.ve ? `–${ref.ve}` : ""}`;
}

export default function Discover() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"scripture" | "gatherings" | "prayer">(
    "scripture"
  );
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
          <Icon name="book" /> {t("discover.tabScripture")}
        </button>
        <button
          className={tab === "gatherings" ? "active" : ""}
          onClick={() => setTab("gatherings")}
          aria-pressed={tab === "gatherings"}
        >
          <Icon name="church" /> {t("discover.tabGatherings")}
        </button>
        <button
          className={tab === "prayer" ? "active" : ""}
          onClick={() => setTab("prayer")}
          aria-pressed={tab === "prayer"}
        >
          <Icon name="prayer" /> {t("discover.tabPrayer")}
        </button>
      </div>
      <p className="subtitle">
        {tab === "scripture"
          ? t("discover.subtitleScripture")
          : tab === "prayer"
            ? t("discover.subtitlePrayer")
            : t("discover.subtitle")}
      </p>

      {tab === "prayer" ? (
        // no churchId: the open wall rather than a Gathering's list
        <PrayerList />
      ) : tab === "scripture" ? (
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
  const [missing, setMissing] = useState(false);
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
      .catch(() => {
        // offline and this book isn't stored: say so rather than spin
        setText(null);
        setMissing(true);
      });
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
      <p className="votd-label"><Icon name="sun" /> {t("discover.votd")}</p>
      {missing ? (
        <p className="cal-hint">{t("discover.votdOffline")}</p>
      ) : text === null ? (
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
              <Icon name="book" /> {t("discover.openReader")}
            </Link>
            <button className="btn btn-sm" onClick={share}>
              <Icon name="share" /> {copied ? t("churches.copied") : t("discover.share")}
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
            <span className="emoji"><Icon name={topic.icon} /></span>
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
              <Icon name={open.icon} /> {t(`topic.${open.id}` as MessageKey)}
            </h2>
            <div className="topic-list">
              {open.passages.map((ref, i) => (
                <Link
                  key={i}
                  className="glass search-result"
                  href={`/?b=${ref.b}&c=${ref.c}&v=${ref.v}`}
                  onClick={() => setOpen(null)}
                >
                  <span className="ref"><Icon name="book" /> {refLabel(ref, lang)}</span>
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
  // the handlers need what progress is *now*, not what it was when they were
  // built: two quick taps on "mark read" should count as two days
  const progressRef = useRef<Record<string, number>>({});
  // no "everything" chip: the plans open on the first category
  const [filter, setFilter] = useState<string>(PLAN_CATEGORIES[0]);

  const apply = (next: Record<string, number>) => {
    progressRef.current = next;
    setProgress(next);
  };

  // progress is local-first, the same as bookmarks and notes: a day marked
  // read on a plane is on screen at once and reaches the server later
  useEffect(() => {
    let cancelled = false;
    readLocalState().then((local) => {
      if (cancelled || !local?.plans) return;
      apply(local.plans);
    });
    startSync();
    (async () => {
      try {
        const synced = await flush();
        if (cancelled) return;
        if (synced) {
          apply(synced.plans ?? {});
          return;
        }
        // Nothing flushed. If plan changes are still queued this device is
        // ahead of the server, and reading would undo them on screen.
        const queued = await readOutbox();
        if (queued.some((op) => op.kind === "plan.set")) return;
        const res = await api<{ who?: string; progress: Record<string, number> }>(
          "/api/plans/progress"
        );
        if (cancelled) return;
        await adoptIdentity(res.who);
        apply(res.progress);
        void writeLocalState({ plans: res.progress });
      } catch {
        // offline: the local snapshot above is what we read from
      }
    })();
    return () => {
      cancelled = true;
    };
    // mount only: this settles what the device holds, once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Today where this device is standing — the honest date for an offline read. */
  const localDate = () => {
    try {
      return new Intl.DateTimeFormat("en-CA").format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  };

  /** Record where a plan now stands. States the total, never "+1", so a
   *  batch the server takes twice can't advance anyone twice. */
  const setDone = (planId: string, done: number, on?: string) => {
    const next = { ...progressRef.current, [planId]: done };
    apply(next);
    void writeLocalState({ plans: next });
    void enqueue({ kind: "plan.set", id: planId, done, on, ts: Date.now() });
  };

  const complete = (planId: string, total: number) =>
    setDone(
      planId,
      Math.min((progressRef.current[planId] ?? 0) + 1, total),
      localDate()
    );

  const reset = (planId: string) => setDone(planId, 0);

  const started = PLANS.filter(
    (p) => (progress[p.id] ?? 0) > 0 && (progress[p.id] ?? 0) < p.days.length
  );
  const shown =
    filter === "mine"
      ? started
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
        {PLAN_CATEGORIES.map((key) => (
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
                  <Icon name={plan.icon} /> {t(`plan.${plan.id}` as MessageKey)}
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
                  <span className="email-sent"><Icon name="party" /> {t("discover.planDone")}</span>
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
                      <Icon name="book" /> {t("discover.day", { n: String(done + 1) })}:{" "}
                      {dayLabel(today)}
                    </Link>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => complete(plan.id, total)}
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
            <span className="session-icon"><Icon name={SESSION_ICON[event.type]} /></span>
            <div className="session-body">
              <h3>{event.title}</h3>
              <p className="session-meta">
                <Icon name="church" /> {event.churchName} · {when}
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
        <span aria-hidden><Icon name="search" /></span>
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
                  <Icon name="people" /> {t(church.memberCount === 1 ? "discover.memberOne" : "discover.members", { count: String(church.memberCount) })}
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
