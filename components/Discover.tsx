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
import { useI18n, type Lang, type MessageKey } from "@/lib/i18n";
import { useStickyTab } from "@/lib/stickyTab";
import StartGathering from "@/components/StartGathering";
import MyWall from "@/components/MyWall";
import PlanBuilder from "@/components/PlanBuilder";
import {
  isCustomPlanId,
  type CustomPlanRow,
  type PublicPlanCard,
} from "@/lib/customPlanTypes";
import type { DiscoverChurch, SessionType, WorshipEvent } from "@/lib/types";



type Gathering = WorshipEvent & { churchName: string };

function refLabel(ref: VerseRef, lang: Lang): string {
  const book = getBook(ref.b);
  const name = book ? (lang === "es" ? book.es : book.en) : "";
  return `${name} ${ref.c}:${ref.v}${ref.ve ? `–${ref.ve}` : ""}`;
}

/** The toggles, in the order the row shows them. */
const DISCOVER_TABS = ["scripture", "wall", "gatherings"] as const;

export default function Discover() {
  const { t } = useI18n();
  const [tab, setTab] = useStickyTab("discover", "scripture", DISCOVER_TABS);
  const [churches, setChurches] = useState<DiscoverChurch[] | null>(null);
  const [gatherings, setGatherings] = useState<Gathering[]>([]);
  /*
   * The plan a reminder was about, if this page was opened by one.
   *
   * Read from window rather than useSearchParams: this page is prerendered,
   * and that hook would either make it dynamic or need a Suspense boundary
   * around the whole screen for a query string that is almost never there.
   * Read once, on mount, because it only ever arrives with the navigation.
   */
  const [openPlan, setOpenPlan] = useState<string | null>(null);
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("plan");
    // A plan the reader wrote is not in the catalogue, and the reminder that
    // names it is the one thing this link exists to serve — testing only
    // against PLANS made every custom plan's 7am push land nowhere.
    if (wanted && (PLANS.some((p) => p.id === wanted) || isCustomPlanId(wanted))) {
      setOpenPlan(wanted);
      // A reminder tapped at seven in the morning has to land on the plan,
      // and the plans live under Scripture. Whichever toggle this reader was
      // last on, arriving by deep link is arriving somewhere specific — so
      // the link outranks what the page would otherwise remember.
      setTab("scripture");
    }
    // setTab is stable, and listing it would re-run this on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        {/* between the Word and the people, which is where it belongs: the
            verses on it came from the one and are held with the other */}
        <button
          className={tab === "wall" ? "active" : ""}
          onClick={() => setTab("wall")}
          aria-pressed={tab === "wall"}
        >
          <Icon name="wall" /> {t("wall.mine")}
        </button>
        <button
          className={tab === "gatherings" ? "active" : ""}
          onClick={() => setTab("gatherings")}
          aria-pressed={tab === "gatherings"}
        >
          <Icon name="church" /> {t("discover.tabGatherings")}
        </button>
      </div>
      <p className="subtitle">
        {tab === "scripture"
          ? t("discover.subtitleScripture")
          : tab === "wall"
            ? t("wall.mineLead")
            : t("discover.subtitle")}
      </p>

      {tab === "wall" ? (
        <MyWall />
      ) : tab === "scripture" ? (
        <>
          <VerseOfDay />
          <TopicsSection />
          <PlansSection open={openPlan} />
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

function PlansSection({ open }: { open: string | null }) {
  const { lang, t } = useI18n();
  const [progress, setProgress] = useState<Record<string, number>>({});
  // the handlers need what progress is *now*, not what it was when they were
  // built: two quick taps on "mark read" should count as two days
  const progressRef = useRef<Record<string, number>>({});
  /*
   * Which chip is up.
   *
   * Normally the first, because the plans have to open on something. When a
   * reminder has named a plan it is that plan's own category instead — the
   * chips are a filter, so landing on the wrong one would mean arriving at a
   * page that does not contain the thing you were sent to see.
   */
  const [filter, setFilter] = useState<string>(
    (open && PLANS.find((p) => p.id === open)?.category) ||
      (open && isCustomPlanId(open) ? "custom" : "") ||
      PLAN_CATEGORIES[0]
  );
  /** the card a reminder pointed at, marked until it is looked at */
  const [pointed, setPointed] = useState<string | null>(open);
  /** the plans this reader wrote — null until the server has answered */
  const [mine, setMine] = useState<CustomPlanRow[] | null>(null);
  /** the plan being written or corrected, or "new" for a fresh one */
  const [building, setBuilding] = useState<CustomPlanRow | "new" | null>(null);
  /** which one just went on the clipboard as a link */
  const [copied, setCopied] = useState<string | null>(null);
  /** the public shelf — null until the reader asks to see it */
  const [shelf, setShelf] = useState<PublicPlanCard[] | null>(null);

  useEffect(() => {
    if (filter !== "discover" || shelf !== null) return;
    api<{ plans: PublicPlanCard[] }>("/api/plans/discover")
      .then((res) => setShelf(res.plans))
      .catch(() => setShelf([]));
  }, [filter, shelf]);

  // Fetched once the reader asks to see their own, rather than on arrival.
  // Almost nobody has written a plan, and the catalogue is what this section
  // is for.
  useEffect(() => {
    if (filter !== "custom" || mine !== null) return;
    api<{ plans: CustomPlanRow[] }>("/api/plans/custom")
      .then((res) => setMine(res.plans))
      .catch(() => setMine([]));
  }, [filter, mine]);

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

  /*
   * A reminder named a plan. Show the chip that contains it, then put it in
   * front of the reader.
   *
   * Two steps and not one, because the card cannot be scrolled to until the
   * filter holding it has been applied — and the filter is applied by a
   * render. The scroll below runs after that render has committed, which is
   * the first moment the card exists to be scrolled to.
   */
  useEffect(() => {
    if (!open) return;
    const plan = PLANS.find((p) => p.id === open);
    // A custom plan lives on its own shelf rather than in a category
    setFilter(plan ? plan.category : isCustomPlanId(open) ? "custom" : "");
    if (plan || isCustomPlanId(open)) setPointed(open);
  }, [open]);

  useEffect(() => {
    if (!pointed) return;
    const el = document.getElementById(`plan-${pointed}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // The ring is a pointer, not a state: it says "this one", and once the
    // reader is looking at it it has nothing left to say. Six seconds, and
    // not three, because the clock starts here — before the smooth scroll
    // has even arrived — so a short one can be over by the time the card is
    // under the reader's eyes.
    const timer = window.setTimeout(() => setPointed(null), 6000);
    return () => window.clearTimeout(timer);
  }, [pointed, filter]);

  // enrolled and not yet finished — see the note in the journal about why
  // this asks whether the plan is there rather than how far into it you are
  const started = PLANS.filter(
    (p) => p.id in progress && (progress[p.id] ?? 0) < p.days.length
  );
  const shown =
    filter === "mine"
      ? started
      : filter === "custom" || filter === "discover"
        ? []
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
        {/* Three chips for what people write rather than what the app ships,
            and the order is the order somebody meets them: what everyone has
            written, then what I have written, then how to write one. "Build
            custom" is not a filter at all — it is the way in, and putting it
            in the same row is what makes it findable, because a reader who
            has never built one is looking at this row when the thought
            occurs. */}
        <button
          type="button"
          className={`chip${filter === "discover" ? " chip-active" : ""}`}
          onClick={() => setFilter("discover")}
        >
          <Icon name="globe" /> {t("builder.discover")}
        </button>
        <button
          type="button"
          className={`chip${filter === "custom" ? " chip-active" : ""}`}
          onClick={() => setFilter("custom")}
        >
          <Icon name="plan" /> {t("builder.custom")}
        </button>
        <button
          type="button"
          className="chip chip-build"
          onClick={() => setBuilding("new")}
        >
          + {t("builder.build")}
        </button>
      </div>
      {filter === "discover" && (
        <PublicShelf
          plans={shelf}
          onTaken={() => {
            // taken plans belong on the reader's own shelf now
            setMine(null);
            setFilter("custom");
          }}
        />
      )}

      {filter === "custom" && (
        <CustomPlans
          plans={mine}
          progress={progress}
          onEdit={setBuilding}
          onChanged={setMine}
          copied={copied}
          setCopied={setCopied}
          onMark={complete}
          pointed={pointed}
        />
      )}

      {building && (
        <PlanBuilder
          editing={building === "new" ? null : building}
          onClose={() => setBuilding(null)}
          onSaved={(plan) => {
            setBuilding(null);
            setMine((prev) => {
              const rest = (prev ?? []).filter((p) => p.id !== plan.id);
              return [plan, ...rest];
            });
            // a plan saved is a plan begun, so show it rather than leaving the
            // reader on whichever shelf of the catalogue they were looking at
            setFilter("custom");
            apply({ ...progressRef.current, [plan.id]: progressRef.current[plan.id] ?? 0 });
          }}
        />
      )}

      <div className="plan-grid">
        {shown.map((plan) => {
          const done = progress[plan.id] ?? 0;
          const total = plan.days.length;
          const finished = done >= total;
          const today = finished ? null : plan.days[done];
          return (
            <div
              key={plan.id}
              id={`plan-${plan.id}`}
              className={`glass card plan-card${
                pointed === plan.id ? " plan-pointed" : ""
              }`}
            >
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

/**
 * Plans other readers have put where anybody can find them.
 *
 * Cards rather than the plans themselves: the shelf has to be readable
 * without opening everything on it, so what a card carries is what somebody
 * browsing actually decides on — the name, who wrote it, and how long it is.
 * Tapping through opens the same page a shared link opens, which is where the
 * whole plan can be read before any of it is taken.
 */
function PublicShelf({
  plans,
  onTaken,
}: {
  plans: PublicPlanCard[] | null;
  onTaken: () => void;
}) {
  const { t } = useI18n();
  const [taking, setTaking] = useState<string | null>(null);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  if (plans === null) return <p className="skeleton">{t("common.loading")}</p>;
  if (plans.length === 0) {
    return <p className="glass card empty">{t("builder.discoverEmpty")}</p>;
  }

  const take = async (token: string) => {
    setTaking(token);
    setError("");
    try {
      await api(`/api/plans/shared/${token}`, { method: "POST" });
      setTaken((prev) => new Set(prev).add(token));
      onTaken();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTaking(null);
    }
  };

  return (
    <>
      <p className="subtitle plans-lead">{t("builder.discoverLead")}</p>
      {error && <p className="error-text">{error}</p>}
      <div className="plan-grid">
        {plans.map((card) => (
          <div key={card.token} className="glass card plan-card">
            <div className="plan-head">
              <h3>
                <Icon name="plan" /> {card.name}
              </h3>
            </div>
            <p className="plan-meta">
              {t("builder.by", { name: card.sharedBy })} ·{" "}
              {t("discover.planLength", { n: String(card.days) })}
            </p>
            <div className="plan-actions">
              {/* it opens the plan, not a chapter — the whole thing, day by
                  day, which is what anybody wants before taking one on */}
              <Link className="cal-link" href={`/plans/${card.token}`}>
                <Icon name="plan" /> {t("builder.see")}
              </Link>
              {taken.has(card.token) ? (
                <span className="email-sent">
                  <Icon name="party" /> {t("shared.planTaken")}
                </span>
              ) : (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => take(card.token)}
                  disabled={taking !== null}
                >
                  {taking === card.token ? t("common.loading") : t("builder.take")}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * The plans this reader wrote.
 *
 * Shown as cards beside the catalogue's, because from where the reader stands
 * they are the same thing — something to read through — and only the buttons
 * differ: these can be corrected, shared and thrown away, and the catalogue's
 * cannot.
 */
function CustomPlans({
  plans,
  progress,
  onEdit,
  onChanged,
  copied,
  setCopied,
  onMark,
  pointed,
}: {
  plans: CustomPlanRow[] | null;
  progress: Record<string, number>;
  onEdit: (plan: CustomPlanRow) => void;
  onChanged: (next: CustomPlanRow[]) => void;
  copied: string | null;
  setCopied: (id: string | null) => void;
  onMark: (planId: string, total: number) => void;
  /** the card a reminder pointed at, so a custom plan can be rung too */
  pointed: string | null;
}) {
  const { lang, t } = useI18n();

  if (plans === null) return <p className="skeleton">{t("common.loading")}</p>;
  if (plans.length === 0) {
    return <p className="glass card empty">{t("builder.noneYet")}</p>;
  }

  /**
   * Put the link where it can be pasted.
   *
   * The share sheet first where there is one, because on a phone that is how
   * anything is sent to anybody; the clipboard where there is not. Either way
   * the link is minted first — an address that does not exist yet cannot be
   * shared, and the round trip is what makes it exist.
   */
  const share = async (plan: CustomPlanRow) => {
    try {
      const res = await api<{ url: string }>(
        `/api/plans/custom/${plan.id}/share`,
        { method: "POST" }
      );
      const message = `${plan.name} — ${res.url}`;
      if (navigator.share) {
        await navigator.share({ text: message });
        return;
      }
      await navigator.clipboard.writeText(message);
      setCopied(plan.id);
      window.setTimeout(() => setCopied(null), 2600);
    } catch {
      // sheet dismissed, or no clipboard — nothing to say about either
    }
  };

  const remove = async (plan: CustomPlanRow) => {
    if (!window.confirm(t("builder.deleteConfirm", { name: plan.name }))) return;
    onChanged(plans.filter((p) => p.id !== plan.id));
    await api(`/api/plans/custom?id=${encodeURIComponent(plan.id)}`, {
      method: "DELETE",
    }).catch(() => {
      // gone from the screen; the next load is the arbiter
    });
  };

  return (
    <div className="plan-grid">
      {plans.map((plan) => {
        const total = plan.days.length;
        const done = Math.min(progress[plan.id] ?? 0, total);
        const finished = done >= total;
        const today = finished ? null : plan.days[done];
        const first = today?.[0];
        return (
          <div
            key={plan.id}
            id={`plan-${plan.id}`}
            className={`glass card plan-card${
              pointed === plan.id ? " plan-pointed" : ""
            }`}
          >
            <div className="plan-head">
              <h3>
                <Icon name="plan" /> {plan.name}
              </h3>
              <span className="plan-count">
                {done}/{total}
              </span>
            </div>
            <p className="plan-meta">
              {t("discover.planLength", { n: String(total) })}
              {plan.fromName && <> · {t("builder.by", { name: plan.fromName })}</>}
              {/* so a reader can see at a glance which of theirs are out
                  where other people can find them */}
              {plan.listed && (
                <>
                  {" "}
                  <span className="chip open-chip">
                    {t("builder.listedBadge")}
                  </span>
                </>
              )}
            </p>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.round((done / total) * 100)}%` }}
              />
            </div>
            <div className="plan-actions">
              {first && today ? (
                <Link className="cal-link" href={`/?b=${first[0]}&c=${first[1]}`}>
                  <Icon name="book" /> {t("discover.day", { n: String(done + 1) })}:{" "}
                  {/* the whole day, not just where it starts — a day of three
                      chapters that announces one is a day that lies about
                      itself, and the catalogue's cards say all of theirs */}
                  {today
                    .map(([b, c]) =>
                      refLabel({ b, c, v: 1 }, lang).replace(/:1$/, "")
                    )
                    .join(" · ")}
                </Link>
              ) : (
                <span className="email-sent">
                  <Icon name="party" /> {t("discover.planDone")}
                </span>
              )}
              {!finished && (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => onMark(plan.id, total)}
                >
                  ✓ {t("discover.markRead")}
                </button>
              )}
            </div>
            <div className="plan-own-actions">
              <button
                type="button"
                className="jr-share"
                onClick={() => onEdit(plan)}
                aria-label={t("builder.edit", { name: plan.name })}
                title={t("builder.edit", { name: plan.name })}
              >
                <Icon name="note" />
              </button>
              <button
                type="button"
                className="jr-share"
                onClick={() => share(plan)}
                aria-label={t("builder.share", { name: plan.name })}
                title={t("builder.share", { name: plan.name })}
              >
                <Icon name="share" />
              </button>
              <button
                type="button"
                className="jr-share jr-danger"
                onClick={() => remove(plan)}
                aria-label={t("builder.delete", { name: plan.name })}
                title={t("builder.delete", { name: plan.name })}
              >
                <Icon name="trash" />
              </button>
              {copied === plan.id && (
                <span className="email-sent">{t("builder.shared")}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
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
