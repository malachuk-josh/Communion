"use client";

import Link from "next/link";
import Icon, { SESSION_ICON } from "@/components/Icon";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SignInButton } from "@clerk/nextjs";
import { api, getSavedName, guestId } from "@/lib/client";
import {
  googleCalendarUrl,
  googleEventTemplateUrl,
  outlookCalendarUrl,
} from "@/lib/calendar";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { parsePassage } from "@/lib/passage";
import MonthGrid from "@/components/MonthGrid";
import PrayerList from "@/components/PrayerList";
import ChurchWall from "@/components/ChurchWall";
import ThreadList from "@/components/ThreadList";
import type { ChurchDetail, RsvpStatus, SessionType, WorshipEvent } from "@/lib/types";

const TEMPLATES: {
  type: SessionType;
  duration: number;
  choices?: number;
  hasToggle?: boolean;
}[] = [
  { type: "bible_study", duration: 60, choices: 3, hasToggle: true },
  { type: "prayer", duration: 30, choices: 3, hasToggle: true },
  { type: "communion", duration: 45, choices: 2, hasToggle: true },
  { type: "praise_worship", duration: 60, choices: 3, hasToggle: true },
  { type: "fellowship", duration: 90, choices: 4, hasToggle: true },
  { type: "custom", duration: 60 },
];



const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function ChurchHome({ churchId }: { churchId: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [church, setChurch] = useState<ChurchDetail | null>(null);
  const [myUserId, setMyUserId] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [editingEvent, setEditingEvent] = useState<WorshipEvent | null>(null);
  const [showEditChurch, setShowEditChurch] = useState(false);
  const [requested, setRequested] = useState(false);

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

  const leave = async () => {
    if (!window.confirm(t("churches.leaveConfirm"))) return;
    try {
      await api(`/api/churches/${churchId}/leave`, { method: "POST" });
      router.push("/churches");
    } catch {
      // transient — stay put
    }
  };

  /**
   * Walk in, or knock.
   *
   * An open Gathering admits at once, so the answer that comes back is a
   * membership rather than a promise — reload, and the page is the one members
   * see. A private one still asks, and says so.
   */
  const joinGathering = async () => {
    const displayName =
      getSavedName() || window.prompt(t("churches.yourName")) || "";
    try {
      const res = await api<{ joined: boolean }>(
        `/api/churches/${churchId}/requests`,
        { method: "POST", body: { displayName } }
      );
      if (res.joined) load();
      else setRequested(true);
    } catch {
      // already a member, already asked, or transient — reload shows the truth
      load();
    }
  };

  const resolveRequest = async (requesterId: string, action: string) => {
    try {
      await api(`/api/churches/${churchId}/requests/${requesterId}`, {
        method: "POST",
        body: { action },
      });
      load();
    } catch {
      load();
    }
  };

  const isMember = church.myRole !== null;

  return (
    <div>
      <h1 className="page-title">
        {church.name}
        {church.visibility === "private" && (
          <span className="chip private-chip"><Icon name="lock" /> {t("churches.privateBadge")}</span>
        )}
        {church.myRole === "founder" && (
          <button
            type="button"
            className="rsvp-btn title-edit"
            onClick={() => setShowEditChurch(true)}
            aria-label={t("churches.editChurch")}
            title={t("churches.editChurch")}
          >
            ✎
          </button>
        )}
      </h1>
      <blockquote className="founding-verse">
        {t("verse.matthew")}
        <cite>{t("verse.matthewRef")}</cite>
      </blockquote>
      {church.description && <p className="subtitle">{church.description}</p>}

      <div className="section-head">
        <h2>
          {t("churches.members")} ({church.members.length})
        </h2>
        {isMember && (
          <button className="btn btn-sm" onClick={() => setShowInvite(true)}>
            <Icon name="envelope" /> {t("churches.invite")}
          </button>
        )}
      </div>
      <div className="chips member-chips">
        {church.members.map((m) => (
          <span key={m.userId} className="chip">
            {m.displayName}
            {m.role === "founder" && (
              <span className="role">★ {t("churches.founder")}</span>
            )}
            {church.myRole === "founder" && m.role !== "founder" && (
              <button
                type="button"
                className="chip-remove"
                aria-label={t("churches.removeMember", { name: m.displayName })}
                title={t("churches.removeMember", { name: m.displayName })}
                onClick={async () => {
                  if (
                    !window.confirm(
                      t("churches.removeMember", { name: m.displayName })
                    )
                  )
                    return;
                  try {
                    await api(`/api/churches/${churchId}/members/${m.userId}`, {
                      method: "DELETE",
                    });
                    load();
                  } catch {
                    load();
                  }
                }}
              >
                ✕
              </button>
            )}
          </span>
        ))}
        {church.myRole === "member" && (
          <button type="button" className="rsvp-btn" onClick={leave}>
            {t("churches.leave")}
          </button>
        )}
      </div>

      {!isMember && (
        <div className="glass card" style={{ textAlign: "center", marginTop: 22 }}>
          {requested || church.requestPending ? (
            <p className="email-sent">✓ {t("churches.requestSent")}</p>
          ) : clerkEnabled && !myUserId ? (
            <SignInButton mode="modal" forceRedirectUrl={`/churches/${churchId}`}>
              <button className="btn btn-primary">
                {t("churches.signInToJoin")}
              </button>
            </SignInButton>
          ) : (
            <button className="btn btn-primary" onClick={joinGathering}>
              <Icon name="handshake" />{" "}
              {church.visibility === "private"
                ? t("churches.requestJoin")
                : t("churches.join")}
            </button>
          )}
        </div>
      )}

      {church.requests && church.requests.length > 0 && (
        <>
          <div className="section-head">
            <h2>
              {t("churches.joinRequests")} ({church.requests.length})
            </h2>
          </div>
          {church.requests.map((r) => (
            <div key={r.userId} className="glass session request-row">
              <span className="session-icon"><Icon name="person" /></span>
              <div className="session-body">
                <h3>{r.displayName}</h3>
              </div>
              <span className="session-tools">
                <button
                  className="rsvp-btn active"
                  onClick={() => resolveRequest(r.userId, "approve")}
                >
                  ✓ {t("churches.approve")}
                </button>
                <button
                  className="rsvp-btn"
                  onClick={() => resolveRequest(r.userId, "decline")}
                >
                  ✕ {t("churches.decline")}
                </button>
              </span>
            </div>
          ))}
        </>
      )}

      {isMember && church.events.length > 0 && (
        <MonthGrid
          events={church.events}
          onPick={(eventId) =>
            document
              .getElementById(`event-${eventId}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        />
      )}

      {isMember && (
        <>
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
                churchName={church.name}
                members={church.members}
                myUserId={myUserId}
                canCancel={
                  event.createdBy === myUserId || church.myRole === "founder"
                }
                onEdit={() => setEditingEvent(event)}
                onChanged={load}
              />
            ))
          )}
        </>
      )}

      {/* The prayer list is for members and no one else, even here, where
          the Gathering is public and everything around it is on show. The
          discussions are the opposite: being able to read them is most of
          what makes a Gathering public. */}
      {(isMember || church.visibility === "public") && (
        <ChurchWall churchId={churchId} />
      )}

      {isMember && <PrayerList churchId={churchId} />}

      {(isMember || church.visibility === "public") && (
        <ThreadList churchId={churchId} />
      )}

      {showInvite && (
        <InviteModal churchId={churchId} churchName={church.name} onClose={() => setShowInvite(false)} />
      )}
      {(showSchedule || editingEvent) && (
        <ScheduleModal
          churchId={churchId}
          churchName={church.name}
          initial={editingEvent ?? undefined}
          onClose={() => {
            setShowSchedule(false);
            setEditingEvent(null);
          }}
          onCreated={() => {
            setShowSchedule(false);
            setEditingEvent(null);
            load();
          }}
        />
      )}
      {showEditChurch && (
        <EditChurchModal
          churchId={churchId}
          initialName={church.name}
          initialDescription={church.description}
          initialPrivate={church.visibility === "private"}
          onClose={() => setShowEditChurch(false)}
          onSaved={() => {
            setShowEditChurch(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function EditChurchModal({
  churchId,
  initialName,
  initialDescription,
  initialPrivate,
  onClose,
  onSaved,
}: {
  churchId: string;
  initialName: string;
  initialDescription: string;
  initialPrivate: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isPrivate, setIsPrivate] = useState(initialPrivate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/churches/${churchId}`, {
        method: "PATCH",
        body: {
          name,
          description,
          visibility: isPrivate ? "private" : "public",
        },
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t("churches.editChurch")}</h2>
        <label className="field">
          <span>{t("churches.name")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoFocus
          />
        </label>
        <label className="field">
          <span>{t("churches.description")}</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
          />
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          <Icon name="lock" /> {t("churches.privateLabel")}
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            {t("session.cancel")}
          </button>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={!name.trim() || busy}
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionCard({
  event,
  churchName,
  members,
  myUserId,
  canCancel,
  onEdit,
  onChanged,
}: {
  event: WorshipEvent;
  churchName: string;
  members: { userId: string; displayName: string }[];
  myUserId: string;
  canCancel: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const { lang, t } = useI18n();
  const mine = event.rsvps[myUserId];
  const goingCount = Object.values(event.rsvps).filter((s) => s === "going").length;
  const nameOf = (uid: string) => {
    const m = members.find((mm) => mm.userId === uid);
    return m?.displayName ?? "Believer";
  };
  const goingNames = Object.entries(event.rsvps)
    .filter(([, s]) => s === "going")
    .map(([uid]) => nameOf(uid));
  const maybeNames = Object.entries(event.rsvps)
    .filter(([, s]) => s === "maybe")
    .map(([uid]) => nameOf(uid));

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
    <div className="glass session" id={`event-${event.id}`}>
      <span className="session-icon"><Icon name={SESSION_ICON[event.type]} /></span>
      <div className="session-body">
        <h3>{event.title}</h3>
        <p className="session-meta">
          {when} · {event.durationMin} {t("common.min")}
          {event.details && <> · {event.details}</>}
          {event.passageRef &&
            (() => {
              const parsed = parsePassage(event.passageRef);
              return parsed ? (
                <>
                  {" · "}
                  <Link
                    href={`/?b=${parsed.bookNr}&c=${parsed.chapter}`}
                    className="passage-link"
                  >
                    <Icon name="book" /> {event.passageRef}
                  </Link>
                </>
              ) : (
                <> · {event.passageRef}</>
              );
            })()}
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
        {(goingNames.length > 0 || maybeNames.length > 0) && (
          <p className="session-meta attendee-line">
            <Icon name="people" />{" "}
            {goingNames.length > 0 && (
              <>
                {t("rsvp.going")}: {goingNames.join(", ")}
              </>
            )}
            {goingNames.length > 0 && maybeNames.length > 0 && " · "}
            {maybeNames.length > 0 && (
              <>
                {t("rsvp.maybe")}: {maybeNames.join(", ")}
              </>
            )}
          </p>
        )}
        <div className="cal-row">
          <span className="cal-label"><Icon name="calendar" /> {t("session.addToCalendar")}</span>
          <a
            className="cal-link"
            target="_blank"
            rel="noreferrer"
            href={googleCalendarUrl(event, churchName, window.location.origin)}
          >
            Google
          </a>
          <a
            className="cal-link"
            target="_blank"
            rel="noreferrer"
            href={outlookCalendarUrl(event, churchName, window.location.origin)}
          >
            Outlook
          </a>
          <a
            className="cal-link"
            href={`/api/events/${event.id}/ics${
              process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
                ? ""
                : `?g=${guestId()}`
            }`}
          >
            Apple (.ics)
          </a>
        </div>
      </div>
      {canCancel && (
        <span className="session-tools">
          <button
            type="button"
            className="rsvp-btn"
            onClick={onEdit}
            aria-label={t("session.edit")}
            title={t("session.edit")}
          >
            ✎
          </button>
          <button
            type="button"
            className="rsvp-btn"
            onClick={cancelSession}
            aria-label={t("session.cancelSession")}
            title={t("session.cancelSession")}
          >
            ✕
          </button>
        </span>
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
  const { lang, t } = useI18n();
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [serverEmail, setServerEmail] = useState(false);
  const [messengerHint, setMessengerHint] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [emailError, setEmailError] = useState(false);

  useEffect(() => {
    api<{ url: string; emailEnabled: boolean }>(
      `/api/churches/${churchId}/invites`,
      { method: "POST" }
    )
      .then((res) => {
        setUrl(res.url);
        setServerEmail(res.emailEnabled);
      })
      .catch(() => setUrl(""));
  }, [churchId]);

  const sendInviteEmail = async () => {
    const to = emailTo.trim();
    if (!to || sending) return;
    setSending(true);
    setEmailError(false);
    try {
      await api(`/api/churches/${churchId}/invites`, {
        method: "POST",
        body: { email: to, lang },
      });
      setSentTo(to);
      setEmailTo("");
    } catch {
      setEmailError(true);
    } finally {
      setSending(false);
    }
  };

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

  const messengerFallback = async () => {
    // No Messenger app and no FB App ID for the Send Dialog: copy the link
    // and open Messenger on the web so it can be pasted into a chat.
    try {
      await navigator.clipboard.writeText(url);
      setMessengerHint(true);
    } catch {
      // clipboard unavailable — the visible invite-url box still allows manual copy
    }
    window.open("https://www.messenger.com/", "_blank", "noopener");
  };

  const messenger = () => {
    const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
    const link = encodeURIComponent(url);
    if (appId) {
      window.open(
        `https://www.facebook.com/dialog/send?app_id=${appId}&link=${link}&redirect_uri=${encodeURIComponent(window.location.origin)}`,
        "_blank"
      );
      return;
    }
    const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!isMobile) {
      void messengerFallback();
      return;
    }
    // Mobile: try the Messenger app deep link. If the app takes over, the
    // page hides and we cancel the fallback; otherwise fall back after 1.6s.
    const timer = setTimeout(() => void messengerFallback(), 1600);
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) clearTimeout(timer);
      },
      { once: true }
    );
    window.location.href = `fb-messenger://share?link=${link}`;
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
                <Icon name="link" /> {copied ? t("churches.copied") : t("churches.copyLink")}
              </button>
              {serverEmail ? (
                <div className="email-invite-row">
                  <input
                    type="email"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder={t("churches.emailPlaceholder")}
                    maxLength={120}
                  />
                  <button
                    className="btn"
                    onClick={sendInviteEmail}
                    disabled={!emailTo.trim() || sending}
                  >
                    <Icon name="envelope" /> {t("churches.sendEmail")}
                  </button>
                  {sentTo && !emailError && (
                    <p className="email-sent">
                      ✓ {t("churches.emailSent")} — {sentTo}
                    </p>
                  )}
                  {emailError && (
                    <p className="error-text">{t("reader.error")}</p>
                  )}
                </div>
              ) : (
                <button className="btn" onClick={email}>
                  <Icon name="envelope" /> {t("churches.emailInvite")}
                </button>
              )}
              <button className="btn" onClick={messenger}>
                <Icon name="chat" /> {t("churches.messenger")}
              </button>
              {messengerHint && (
                <p className="email-sent">✓ {t("churches.messengerCopied")}</p>
              )}
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button className="btn" onClick={nativeShare}>
                  <Icon name="share" /> {t("churches.share")}
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

const toLocalInput = (ts: number) => {
  const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

interface PickMember {
  userId: string;
  displayName: string;
  email: string | null;
}

function ScheduleModal({
  churchId,
  churchName,
  initial,
  onClose,
  onCreated,
}: {
  churchId: string;
  churchName: string;
  initial?: WorshipEvent;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(initial ? 3 : 1);
  const [type, setType] = useState<SessionType>(initial?.type ?? "bible_study");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [when, setWhen] = useState(
    initial ? toLocalInput(initial.startsAt) : ""
  );
  const [duration, setDuration] = useState(initial?.durationMin ?? 60);
  const [passageRef, setPassageRef] = useState(initial?.passageRef ?? "");
  const [optIndex, setOptIndex] = useState(0);
  const [toggleOn, setToggleOn] = useState(false);
  const [touchedPurpose, setTouchedPurpose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [meetOpen, setMeetOpen] = useState(false);
  const [pickerMembers, setPickerMembers] = useState<PickMember[] | null>(null);
  const [guests, setGuests] = useState<Set<string>>(new Set());
  const [meetUrl, setMeetUrl] = useState(initial?.meetingUrl ?? "");
  const [meetBusy, setMeetBusy] = useState(false);
  const [meetHint, setMeetHint] = useState<"" | "created" | "fallback">("");

  const template = TEMPLATES.find((tpl) => tpl.type === type)!;
  const tk = (suffix: string) => t(`session.${type}.${suffix}` as MessageKey);

  const pick = (tpl: (typeof TEMPLATES)[number]) => {
    setType(tpl.type);
    setDuration(tpl.duration);
    setTitle(t(`session.${tpl.type}` as MessageKey));
    setOptIndex(0);
    setToggleOn(false);
    setTouchedPurpose(true);
    setStep(2);
  };

  const buildDetails = (): string => {
    if (initial && !touchedPurpose) return initial.details ?? "";
    if (!template.choices) return "";
    const parts = [t(`session.${type}.opt${optIndex + 1}` as MessageKey)];
    if (template.hasToggle && toggleOn) parts.push(tk("toggle"));
    return parts.join(" · ");
  };

  const toggleMeet = () => {
    setMeetOpen((open) => !open);
    if (pickerMembers === null) {
      api<{ members: PickMember[] }>(`/api/churches/${churchId}/emails`)
        .then((res) => {
          setPickerMembers(res.members);
          setGuests(
            new Set(
              res.members.map((m) => m.email).filter((e): e is string => !!e)
            )
          );
        })
        .catch(() => setPickerMembers([]));
    }
  };

  const toggleGuest = (email: string) => {
    setGuests((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const meetTemplateUrl = () =>
    googleEventTemplateUrl({
      title: `${title} — ${churchName}`,
      startsAt: when ? new Date(when).getTime() : undefined,
      durationMin: duration,
      details:
        `${churchName} — Communion` +
        (passageRef.trim() ? `\nPassage: ${passageRef.trim()}` : ""),
      guests: [...guests],
    });

  const createMeet = async () => {
    if (!title.trim() || !when || meetBusy) return;
    setMeetBusy(true);
    setMeetHint("");
    try {
      const res = await api<{ meetUrl: string }>(
        `/api/churches/${churchId}/meet`,
        {
          method: "POST",
          body: {
            title: `${title} — ${churchName}`,
            startsAt: new Date(when).getTime(),
            durationMin: duration,
            details:
              `${churchName} — Communion` +
              (passageRef.trim() ? `\nPassage: ${passageRef.trim()}` : ""),
            guests: [...guests],
          },
        }
      );
      setMeetUrl(res.meetUrl);
      setMeetHint("created");
    } catch {
      // No Google OAuth token (or missing Calendar scope): hand off to the
      // pre-filled Google Calendar template instead.
      setMeetHint("fallback");
      window.open(meetTemplateUrl(), "_blank", "noopener");
    } finally {
      setMeetBusy(false);
    }
  };

  const submit = async () => {
    if (!title.trim() || !when || busy) return;
    setBusy(true);
    setError("");
    const body = {
      type,
      title,
      startsAt: new Date(when).getTime(),
      durationMin: duration,
      passageRef,
      details: buildDetails(),
      meetingUrl: meetUrl.trim() || undefined,
    };
    try {
      if (initial) {
        await api(`/api/events/${initial.id}`, { method: "PATCH", body });
      } else {
        await api(`/api/churches/${churchId}/events`, { method: "POST", body });
      }
      onCreated();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t(initial ? "session.edit" : "churches.schedule")}</h2>
        <div className="steps" aria-hidden>
          {[1, 2, 3].map((n) => (
            <span key={n} className={`step-dot${step === n ? " active" : ""}`}>
              {n}
            </span>
          ))}
        </div>

        {step === 1 && (
          <>
            <p className="modal-sub">{t("session.type")}</p>
            <div className="type-grid">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.type}
                  className={`type-card${type === tpl.type ? " active" : ""}`}
                  onClick={() => pick(tpl)}
                >
                  <span className="emoji"><Icon name={SESSION_ICON[tpl.type]} /></span>
                  <span className="name">
                    {t(`session.${tpl.type}` as MessageKey)}
                  </span>
                  <span className="desc">
                    {t(`session.${tpl.type}.desc` as MessageKey)}
                  </span>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>
                {t("session.cancel")}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="about-box">
              <p className="about-lead">
                <span className="about-emoji"><Icon name={SESSION_ICON[template.type]} /></span>
                {tk("about")}
              </p>
              <blockquote className="founding-verse">
                {tk("verse")}
                <cite>{tk("verseRef")}</cite>
              </blockquote>
              {template.choices ? (
                <label className="field">
                  <span>{tk("optLabel")}</span>
                  <select
                    value={optIndex}
                    onChange={(e) => {
                      setOptIndex(Number(e.target.value));
                      setTouchedPurpose(true);
                    }}
                  >
                    {Array.from({ length: template.choices }, (_, i) => (
                      <option key={i} value={i}>
                        {t(`session.${type}.opt${i + 1}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {template.hasToggle && (
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={toggleOn}
                    onChange={(e) => {
                      setToggleOn(e.target.checked);
                      setTouchedPurpose(true);
                    }}
                  />
                  {tk("toggle")}
                </label>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setStep(1)}>
                {t("common.back")}
              </button>
              <button className="btn btn-primary" onClick={() => setStep(3)}>
                {t("common.next")}
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
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
            <div className="quick-create">
              <span className="cal-label">{t("session.quickCreate")}</span>
              <button type="button" className="cal-link" onClick={toggleMeet}>
                <Icon name="video" /> Google Meet {meetOpen ? "▴" : "▾"}
              </button>
            </div>
            {meetOpen && (
              <div className="member-pick">
                <p className="cal-label">{t("session.pickMembers")}</p>
                {pickerMembers === null ? (
                  <p className="skeleton" style={{ padding: "10px 0" }}>
                    {t("common.loading")}
                  </p>
                ) : (
                  <div className="member-pick-list">
                    {pickerMembers.map((m) => (
                      <label
                        key={m.userId}
                        className={`member-pick-row${m.email ? "" : " disabled"}`}
                      >
                        <input
                          type="checkbox"
                          disabled={!m.email}
                          checked={!!m.email && guests.has(m.email)}
                          onChange={() => m.email && toggleGuest(m.email)}
                        />
                        <span>{m.displayName}</span>
                        {!m.email && <em>({t("session.noEmail")})</em>}
                      </label>
                    ))}
                  </div>
                )}
                <div className="invite-actions" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={createMeet}
                    disabled={!title.trim() || !when || meetBusy}
                  >
                    <Icon name="video" /> {meetBusy ? t("common.loading") : t("session.createMeet")}
                  </button>
                  <a
                    className="btn btn-sm"
                    target="_blank"
                    rel="noreferrer"
                    href={meetTemplateUrl()}
                  >
                    <Icon name="calendar" /> {t("session.googleInvite")}
                  </a>
                  <a
                    className="btn btn-sm"
                    target="_blank"
                    rel="noreferrer"
                    href="https://meet.google.com/new"
                  >
                    <Icon name="fire" /> {t("session.instantMeet")}
                  </a>
                </div>
                {meetHint === "created" && meetUrl && (
                  <p className="email-sent">
                    ✓ {t("session.meetReady")}{" "}
                    <a href={meetUrl} target="_blank" rel="noreferrer">
                      {meetUrl.replace(/^https?:\/\//, "")}
                    </a>
                  </p>
                )}
                {meetHint === "fallback" && (
                  <p className="cal-hint">{t("session.meetFallbackHint")}</p>
                )}
                <p className="cal-hint">{t("session.meetPickHint")}</p>
              </div>
            )}
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button className="btn" onClick={() => setStep(2)}>
                {t("common.back")}
              </button>
              <button
                className="btn btn-primary"
                onClick={submit}
                disabled={!title.trim() || !when || busy}
              >
                {t(initial ? "common.save" : "session.create")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
