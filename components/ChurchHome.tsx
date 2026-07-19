"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n, type MessageKey } from "@/lib/i18n";
import type { ChurchDetail, RsvpStatus, SessionType, WorshipEvent } from "@/lib/types";

const TEMPLATES: { type: SessionType; emoji: string; duration: number }[] = [
  { type: "bible_study", emoji: "📖", duration: 60 },
  { type: "prayer", emoji: "🙏", duration: 30 },
  { type: "communion", emoji: "🍞", duration: 45 },
  { type: "praise_worship", emoji: "🎶", duration: 60 },
  { type: "custom", emoji: "✨", duration: 60 },
];

const EMOJI: Record<SessionType, string> = {
  bible_study: "📖",
  prayer: "🙏",
  communion: "🍞",
  praise_worship: "🎶",
  custom: "✨",
};

export default function ChurchHome({ churchId }: { churchId: string }) {
  const { lang, t } = useI18n();
  const [church, setChurch] = useState<ChurchDetail | null>(null);
  const [myUserId, setMyUserId] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  const load = useCallback(() => {
    api<{ church: ChurchDetail; myUserId: string }>(`/api/churches/${churchId}`)
      .then((res) => {
        setChurch(res.church);
        setMyUserId(res.myUserId);
      })
      .catch(() => setNotFound(true));
  }, [churchId]);

  useEffect(load, [load]);

  if (notFound) {
    return <p className="empty glass card">{t("join.invalid")}</p>;
  }
  if (!church) {
    return <p className="skeleton">{t("common.loading")}</p>;
  }

  return (
    <div>
      <h1 className="page-title">{church.name}</h1>
      <blockquote className="founding-verse">
        {t("verse.matthew")}
        <cite>{t("verse.matthewRef")}</cite>
      </blockquote>
      {church.description && <p className="subtitle">{church.description}</p>}

      <div className="section-head">
        <h2>
          {t("churches.members")} ({church.members.length})
        </h2>
        <button className="btn btn-sm" onClick={() => setShowInvite(true)}>
          ✉️ {t("churches.invite")}
        </button>
      </div>
      <div className="chips">
        {church.members.map((m) => (
          <span key={m.userId} className="chip">
            {m.displayName}
            {m.role === "founder" && (
              <span className="role">★ {t("churches.founder")}</span>
            )}
          </span>
        ))}
      </div>

      <div className="section-head">
        <h2>{t("churches.upcoming")}</h2>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => setShowSchedule(true)}
        >
          ＋ {t("churches.schedule")}
        </button>
      </div>

      {church.events.length === 0 ? (
        <div className="glass card empty">{t("churches.noSessions")}</div>
      ) : (
        church.events.map((event) => (
          <SessionCard
            key={event.id}
            event={event}
            myUserId={myUserId}
            canCancel={
              event.createdBy === myUserId || church.myRole === "founder"
            }
            onChanged={load}
          />
        ))
      )}

      {showInvite && (
        <InviteModal churchId={churchId} churchName={church.name} onClose={() => setShowInvite(false)} />
      )}
      {showSchedule && (
        <ScheduleModal
          churchId={churchId}
          onClose={() => setShowSchedule(false)}
          onCreated={() => {
            setShowSchedule(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function SessionCard({
  event,
  myUserId,
  canCancel,
  onChanged,
}: {
  event: WorshipEvent;
  myUserId: string;
  canCancel: boolean;
  onChanged: () => void;
}) {
  const { lang, t } = useI18n();
  const mine = event.rsvps[myUserId];
  const goingCount = Object.values(event.rsvps).filter((s) => s === "going").length;

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

  const rsvp = async (status: RsvpStatus) => {
    try {
      await api(`/api/events/${event.id}/rsvp`, {
        method: "POST",
        body: { status },
      });
      onChanged();
    } catch {
      // transient — the next reload shows the truth
    }
  };

  const cancelSession = async () => {
    if (!window.confirm(t("session.cancelConfirm"))) return;
    try {
      await api(`/api/events/${event.id}`, { method: "DELETE" });
      onChanged();
    } catch {
      // transient — the next reload shows the truth
    }
  };

  return (
    <div className="glass session">
      <span className="session-icon">{EMOJI[event.type]}</span>
      <div className="session-body">
        <h3>{event.title}</h3>
        <p className="session-meta">
          {when} · {event.durationMin} {t("common.min")}
          {event.passageRef && <> · {event.passageRef}</>}
          {event.meetingUrl && (
            <>
              {" · "}
              <a href={event.meetingUrl} target="_blank" rel="noreferrer">
                {t("session.joinCall")}
              </a>
            </>
          )}
        </p>
        <div className="rsvp-row">
          {(["going", "maybe", "no"] as RsvpStatus[]).map((status) => (
            <button
              key={status}
              className={`rsvp-btn${mine === status ? " active" : ""}`}
              onClick={() => rsvp(status)}
            >
              {t(`rsvp.${status}` as MessageKey)}
            </button>
          ))}
          <span className="rsvp-count">
            {goingCount} {t("rsvp.going").toLowerCase()}
          </span>
        </div>
      </div>
      {canCancel && (
        <button
          type="button"
          className="rsvp-btn"
          onClick={cancelSession}
          aria-label={t("session.cancelSession")}
          title={t("session.cancelSession")}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function InviteModal({
  churchId,
  churchName,
  onClose,
}: {
  churchId: string;
  churchName: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<{ url: string }>(`/api/churches/${churchId}/invites`, {
      method: "POST",
    })
      .then((res) => setUrl(res.url))
      .catch(() => setUrl(""));
  }, [churchId]);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const email = () => {
    const subject = encodeURIComponent(t("email.subject"));
    const body = encodeURIComponent(
      t("email.body", { church: churchName, url })
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const messenger = () => {
    const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
    const link = encodeURIComponent(url);
    if (appId) {
      window.open(
        `https://www.facebook.com/dialog/send?app_id=${appId}&link=${link}&redirect_uri=${encodeURIComponent(window.location.origin)}`,
        "_blank"
      );
    } else {
      // Messenger deep link — opens the app on mobile
      window.location.href = `fb-messenger://share?link=${link}`;
    }
  };

  const nativeShare = () => {
    void navigator.share({ title: "Communion", url });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t("churches.invite")}</h2>
        <p style={{ color: "var(--ink-dim)", fontSize: "0.9rem" }}>
          {t("churches.inviteText")}
        </p>
        {url ? (
          <>
            <p className="invite-url">{url}</p>
            <div className="invite-actions">
              <button className="btn btn-primary" onClick={copy}>
                🔗 {copied ? t("churches.copied") : t("churches.copyLink")}
              </button>
              <button className="btn" onClick={email}>
                ✉️ {t("churches.emailInvite")}
              </button>
              <button className="btn" onClick={messenger}>
                💬 {t("churches.messenger")}
              </button>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button className="btn" onClick={nativeShare}>
                  📤 {t("churches.share")}
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="skeleton">{t("common.loading")}</p>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            {t("session.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleModal({
  churchId,
  onClose,
  onCreated,
}: {
  churchId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [type, setType] = useState<SessionType>("bible_study");
  const [title, setTitle] = useState(t("session.bible_study"));
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState(60);
  const [passageRef, setPassageRef] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = (template: (typeof TEMPLATES)[number]) => {
    setType(template.type);
    setDuration(template.duration);
    setTitle(t(`session.${template.type}` as MessageKey));
  };

  const create = async () => {
    if (!title.trim() || !when || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/churches/${churchId}/events`, {
        method: "POST",
        body: {
          type,
          title,
          startsAt: new Date(when).getTime(),
          durationMin: duration,
          passageRef,
          meetingUrl,
        },
      });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t("churches.schedule")}</h2>
        <p style={{ color: "var(--ink-dim)", fontSize: "0.9rem", marginBottom: 10 }}>
          {t("session.type")}
        </p>
        <div className="type-grid">
          {TEMPLATES.map((template) => (
            <button
              key={template.type}
              className={`type-card${type === template.type ? " active" : ""}`}
              onClick={() => pick(template)}
            >
              <span className="emoji">{template.emoji}</span>
              <span className="name">
                {t(`session.${template.type}` as MessageKey)}
              </span>
              <span className="desc">
                {t(`session.${template.type}.desc` as MessageKey)}
              </span>
            </button>
          ))}
        </div>
        <label className="field">
          <span>{t("session.title")}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
        </label>
        <div className="form-row">
          <label className="field">
            <span>{t("session.when")}</span>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t("session.duration")}</span>
            <input
              type="number"
              min={5}
              max={1440}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </label>
        </div>
        <label className="field">
          <span>{t("session.passage")}</span>
          <input
            value={passageRef}
            onChange={(e) => setPassageRef(e.target.value)}
            placeholder={t("session.passagePlaceholder")}
            maxLength={80}
          />
        </label>
        <label className="field">
          <span>{t("session.meetingUrl")}</span>
          <input
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder={t("session.meetingUrlPlaceholder")}
            maxLength={300}
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            {t("session.cancel")}
          </button>
          <button
            className="btn btn-primary"
            onClick={create}
            disabled={!title.trim() || !when || busy}
          >
            {t("session.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
