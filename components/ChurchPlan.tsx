"use client";

// What the Gathering is reading, and how far each of them has got.
//
// A Gathering reading together is the same reading with company. Nothing
// about progress is stored here — every day count comes from the reader's own
// plan record, the one the Journal shows and the reminders use — so joining
// the Gathering's plan is just enrolling in it, and leaving takes nothing
// away. Somebody nine days in before the room chose it arrives on day nine.
//
// Deliberately not a scoreboard. The list is ordered by who is furthest along
// because that is the useful order — it is the person you ask what is coming —
// but there is no rank, no streak and no badge. What a group needs from this
// is the ability to wait for each other, which needs only the plain fact of
// where everybody is.

import Link from "next/link";
import Icon, { type IconName } from "@/components/Icon";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import { PLANS } from "@/lib/plans";

interface Walker {
  userId: string;
  displayName: string;
  done: number;
  started: boolean;
}

interface CohortPlan {
  id: string;
  name: string;
  icon: string;
  days: number;
}

interface Answer {
  plan: CohortPlan | null;
  members?: Walker[];
  myRole?: string;
  missing?: boolean;
}

export default function ChurchPlan({
  churchId,
  myUserId,
  isFounder,
}: {
  churchId: string;
  myUserId: string;
  isFounder: boolean;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<Answer | null>(null);
  const [picking, setPicking] = useState(false);
  const [choices, setChoices] = useState<CohortPlan[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Answer>(`/api/churches/${churchId}/plan`)
      .then(setState)
      .catch(() => setState({ plan: null }));
  }, [churchId]);

  useEffect(load, [load]);

  /*
   * The catalogue plus anything the founder wrote themselves.
   *
   * The catalogue is a static import — it ships with the app and needs no
   * round trip. Only the founder's own plans are fetched, and only when the
   * picker opens, because this is a screen somebody sees about once in the
   * life of a Gathering.
   */
  const openPicker = async () => {
    setPicking(true);
    if (choices) return;
    const built = PLANS.map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon as string,
      days: p.days.length,
    }));
    const mine = await api<{
      plans: { id: string; name: string; days: unknown[] }[];
    }>("/api/plans/custom").catch(() => ({ plans: [] }));
    setChoices([
      ...built,
      ...mine.plans.map((p) => ({
        id: p.id,
        name: p.name,
        icon: "plan",
        days: p.days.length,
      })),
    ]);
  };

  const choose = async (planId: string) => {
    setBusy(true);
    try {
      await api(`/api/churches/${churchId}/plan`, {
        method: "PUT",
        body: { planId },
      });
      setPicking(false);
      load();
    } finally {
      setBusy(false);
    }
  };

  if (state === null) return null;

  /*
   * Nothing chosen yet.
   *
   * Silent for a member — an empty shelf on every Gathering that has not
   * picked one is clutter, and it is not their decision to make. The founder
   * gets a single line, because otherwise the feature does not exist: there
   * is nowhere else in the app this can be set from.
   */
  if (!state.plan) {
    if (!isFounder) return null;
    return (
      <>
        <div className="section-head">
          <h2>
            <Icon name="plan" /> {t("churchPlan.title")}
          </h2>
        </div>
        <div className="glass card cohort">
          <p className="cal-hint">{t("churchPlan.none")}</p>
          <button type="button" className="btn btn-sm" onClick={openPicker}>
            {t("churchPlan.choose")}
          </button>
        </div>
        {picking && (
          <PlanPicker
            choices={choices}
            busy={busy}
            onPick={choose}
            onClose={() => setPicking(false)}
          />
        )}
      </>
    );
  }

  const { plan, members = [] } = state;
  const me = members.find((m) => m.userId === myUserId);
  const together = members.filter((m) => m.started);

  return (
    <>
      <div className="section-head">
        <h2>
          <Icon name={(plan.icon as IconName) ?? "plan"} />{" "}
          {t("churchPlan.title")}
        </h2>
        <span className="pr-head-tools">
          {isFounder && (
            <button type="button" className="btn btn-sm" onClick={openPicker}>
              {t("churchPlan.change")}
            </button>
          )}
          <Link href={`/discover?plan=${plan.id}`} className="btn btn-sm">
            {t("churchPlan.open")}
          </Link>
        </span>
      </div>

      <div className="glass card cohort">
        <p className="cohort-name">{plan.name}</p>
        <p className="cal-hint">
          {t("churchPlan.readingTogether", {
            n: String(together.length),
            days: String(plan.days),
          })}
        </p>

        {/* Where you are, said first and said plainly — the rest of the list
            is other people, and this is the line the reader came for. */}
        {me && (
          <p className="cohort-me">
            {me.started
              ? me.done >= plan.days
                ? t("churchPlan.youFinished")
                : t("churchPlan.youOnDay", { d: String(me.done + 1) })
              : t("churchPlan.youNotStarted")}
          </p>
        )}

        <ul className="cohort-list">
          {members.map((m) => {
            const pct = plan.days > 0 ? (m.done / plan.days) * 100 : 0;
            return (
              <li key={m.userId} className={m.started ? "" : "cohort-waiting"}>
                <span className="cohort-who">
                  {m.displayName}
                  {m.userId === myUserId && ` ${t("churchPlan.you")}`}
                </span>
                <span
                  className="cohort-bar"
                  aria-hidden
                  style={{ ["--pct" as string]: `${pct}%` }}
                />
                <span className="cohort-day">
                  {!m.started
                    ? "—"
                    : m.done >= plan.days
                      ? t("churchPlan.done")
                      : t("churchPlan.dayN", { d: String(m.done + 1) })}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {picking && (
        <PlanPicker
          choices={choices}
          busy={busy}
          current={plan.id}
          onPick={choose}
          onStop={() => choose("")}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}

/** The founder's list of plans. Modal, because it is a decision for the room. */
function PlanPicker({
  choices,
  busy,
  current,
  onPick,
  onStop,
  onClose,
}: {
  choices: CohortPlan[] | null;
  busy: boolean;
  current?: string;
  onPick: (id: string) => void;
  onStop?: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass card modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{t("churchPlan.pickTitle")}</h3>
        <p className="cal-hint">{t("churchPlan.pickNote")}</p>
        {choices === null ? (
          <p className="cal-hint">{t("common.loading")}</p>
        ) : (
          <div className="cohort-picker">
            {choices.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`btn btn-sm${p.id === current ? " btn-primary" : ""}`}
                disabled={busy}
                onClick={() => onPick(p.id)}
              >
                {p.name} · {p.days}
              </button>
            ))}
          </div>
        )}
        <div className="modal-actions">
          {current && onStop && (
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={onStop}
            >
              {t("churchPlan.stop")}
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
