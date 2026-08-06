"use client";

// Owner-only dashboard. The server is the real gate (the API 404s for
// anyone else); this view simply renders what it returns. Desktop-first —
// small screens get a note rather than a squeezed table.

import Link from "next/link";
import Icon from "@/components/Icon";
import { Fragment, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import BackToMenu from "@/components/BackToMenu";

interface Gathering {
  id: string;
  name: string;
  description: string;
  visibility: string;
  createdAt: number;
  memberCount: number;
  adminName: string;
  threadCount: number;
  eventCount: number;
  members: { userId: string; displayName: string; role: string }[];
}

interface AdminUser {
  userId: string;
  displayName: string;
  email?: string;
  createdAt?: number;
  lastSignInAt?: number;
  phone?: string;
  smsReminders: boolean;
  gatherings: number;
  bookmarks: number;
  pushDevices: number;
  guest: boolean;
  trusted: boolean;
  deactivated: boolean;
}

interface Takeover {
  as: string;
  by: string;
  at: number;
  asName: string;
  byName: string;
}

interface Deactivation {
  user: string;
  by: string;
  off: boolean;
  at: number;
  userName: string;
  byName: string;
}

interface Summary {
  viewerId: string;
  viewerIsOwner: boolean;
  takeoverAvailable: boolean;
  takeovers: Takeover[];
  deactivations: Deactivation[];
  totals: Record<string, number>;
  gatherings: Gathering[];
  users: AdminUser[];
}

const TOTALS: { key: string; label: string }[] = [
  { key: "users", label: "People" },
  { key: "clerkUsers", label: "Accounts" },
  { key: "guests", label: "Guests" },
  { key: "gatherings", label: "Gatherings" },
  { key: "privateGatherings", label: "Private" },
  { key: "members", label: "Memberships" },
  { key: "threads", label: "Discussions" },
  { key: "events", label: "Sessions" },
  { key: "pushDevices", label: "Push devices" },
];

const date = (ts?: number) =>
  ts ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export default function AdminDashboard() {
  const { t } = useI18n();
  const [data, setData] = useState<Summary | null>(null);
  const [denied, setDenied] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busyUser, setBusyUser] = useState<string | null>(null);

  useEffect(() => {
    api<Summary>("/api/admin")
      .then(setData)
      .catch(() => setDenied(true));
  }, []);

  /**
   * Delete a Gathering from here, whoever founded it.
   *
   * The reason this exists rather than leaving it to founders: a Gathering
   * started by a guest identity has no founder who can ever sign in again once
   * accounts are switched on, so nothing else can remove it. The confirmation
   * spells out what goes, because this takes it away from its members too.
   */
  const removeGathering = async (f: Gathering) => {
    const warning =
      `Delete "${f.name}"?\n\n` +
      `${f.memberCount} member(s), ${f.threadCount} discussion(s), ` +
      `${f.eventCount} session(s) go with it. This cannot be undone.`;
    if (!window.confirm(warning)) return;
    setRemoving(f.id);
    try {
      await api(`/api/churches/${f.id}`, { method: "DELETE" });
      setData((prev) =>
        prev
          ? {
              ...prev,
              gatherings: prev.gatherings.filter((g) => g.id !== f.id),
              totals: {
                ...prev.totals,
                gatherings: Math.max(0, (prev.totals.gatherings ?? 1) - 1),
                [f.visibility === "private"
                  ? "privateGatherings"
                  : "publicGatherings"]: Math.max(
                  0,
                  (prev.totals[
                    f.visibility === "private"
                      ? "privateGatherings"
                      : "publicGatherings"
                  ] ?? 1) - 1
                ),
                members: Math.max(0, (prev.totals.members ?? 0) - f.memberCount),
                threads: Math.max(0, (prev.totals.threads ?? 0) - f.threadCount),
                events: Math.max(0, (prev.totals.events ?? 0) - f.eventCount),
              },
            }
          : prev
      );
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setRemoving(null);
    }
  };

  /**
   * Hand someone the dashboard, or take it back.
   *
   * Only the owner sees these buttons, and only the owner's request is
   * honoured — the server checks again, because a button that is merely
   * hidden is not a permission.
   */
  const toggleTrust = async (u: AdminUser) => {
    const next = !u.trusted;
    const warning = next
      ? `Give ${u.displayName} admin access?\n\n` +
        `They will see every person, every Gathering and every discussion in ` +
        `Communion, and can delete a Gathering. They cannot grant this to ` +
        `anyone else, and they cannot stand in an account.`
      : `Take admin access away from ${u.displayName}?`;
    if (!window.confirm(warning)) return;
    setBusyUser(u.userId);
    try {
      await api("/api/admin/trust", {
        method: "POST",
        body: { userId: u.userId, trusted: next },
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.map((x) =>
                x.userId === u.userId ? { ...x, trusted: next } : x
              ),
            }
          : prev
      );
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusyUser(null);
    }
  };

  /**
   * Switch an account off, or back on.
   *
   * Nothing of theirs is deleted, and the warning says so, because the two
   * are easy to confuse at the moment of pressing and only one of them can be
   * undone. What it does is take away their ability to act: from their next
   * request, every route in the app stops answering to them.
   */
  const toggleActive = async (u: AdminUser) => {
    const next = !u.deactivated;
    const warning = next
      ? `Switch off ${u.displayName}?\n\n` +
        `They will not be able to read, write, message anyone or sign in ` +
        `here until you switch them back on. Nothing of theirs is deleted — ` +
        `their Gatherings, verses and prayers all stay exactly where they ` +
        `are, and switching them back on restores them whole.`
      : `Switch ${u.displayName} back on?\n\nThey get their account back as it was.`;
    if (!window.confirm(warning)) return;
    setBusyUser(u.userId);
    try {
      await api("/api/admin/deactivate", {
        method: "POST",
        body: { userId: u.userId, deactivated: next },
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.map((x) =>
                x.userId === u.userId ? { ...x, deactivated: next } : x
              ),
            }
          : prev
      );
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusyUser(null);
    }
  };

  /**
   * Stand in an account.
   *
   * The reload is not a nicety. This device holds a local copy of whoever it
   * was last signed in as — bookmarks, notes, an outbox of unsent changes —
   * and the app's identity check only runs on a fresh load. Going through it
   * is what stops one person's journal being written into another's account.
   */
  const takeOver = async (u: AdminUser) => {
    const warning =
      `Sign in as ${u.displayName}?\n\n` +
      `You will see and do everything as them until you stop, and anything ` +
      `you write will be theirs. Your own bookmarks and notes will be ` +
      `re-fetched from the server when you come back.`;
    if (!window.confirm(warning)) return;
    setBusyUser(u.userId);
    try {
      await api("/api/admin/impersonate", {
        method: "POST",
        body: { userId: u.userId },
      });
      await import("@/lib/offline")
        .then((m) => m.clearApiCache())
        .catch(() => {});
      window.location.href = "/";
    } catch (e) {
      window.alert((e as Error).message);
      setBusyUser(null);
    }
  };

  if (denied) {
    return <p className="empty glass card">{t("join.invalid")}</p>;
  }
  if (!data) {
    return <p className="skeleton">{t("common.loading")}</p>;
  }

  return (
    <div className="admin">
      <BackToMenu />
      <h1 className="page-title"><Icon name="tools" /> Admin</h1>
      <p className="subtitle">
        Everything happening across Communion.
      </p>
      <p className="notice admin-mobile-note">
        The tables are wider than a phone — swipe them sideways, or open this
        on a desktop to see every column at once.
      </p>

      <div className="admin-totals">
        {TOTALS.map((item) => (
          <div key={item.key} className="glass card admin-stat">
            <strong>{data.totals[item.key] ?? 0}</strong>
            <small>{item.label}</small>
          </div>
        ))}
      </div>

      <div className="section-head">
        <h2>Gatherings ({data.gatherings.length})</h2>
      </div>
      <div className="glass card admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Visibility</th>
              <th>Admin</th>
              <th>Members</th>
              <th>Discussions</th>
              <th>Sessions</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.gatherings.map((f) => (
              <Fragment key={f.id}>
                <tr>
                  <td>
                    <Link href={`/churches/${f.id}`} className="passage-link">
                      {f.name}
                    </Link>
                    {f.description && (
                      <div className="admin-sub">{f.description}</div>
                    )}
                  </td>
                  <td>
                    {f.visibility === "private" ? "private" : "public"}
                  </td>
                  <td>{f.adminName}</td>
                  <td>{f.memberCount}</td>
                  <td>{f.threadCount}</td>
                  <td>{f.eventCount}</td>
                  <td>{date(f.createdAt)}</td>
                  <td className="admin-row-actions">
                    <button
                      type="button"
                      className="rsvp-btn"
                      onClick={() =>
                        setExpanded(expanded === f.id ? null : f.id)
                      }
                    >
                      {expanded === f.id ? "▴" : "▾"}
                    </button>
                    <button
                      type="button"
                      className="rsvp-btn jr-danger"
                      title={`Delete ${f.name}`}
                      aria-label={`Delete ${f.name}`}
                      disabled={removing === f.id}
                      onClick={() => removeGathering(f)}
                    >
                      <Icon name="trash" />
                    </button>
                  </td>
                </tr>
                {expanded === f.id && (
                  <tr className="admin-expand">
                    <td colSpan={8}>
                      <div className="chips">
                        {f.members.map((m) => (
                          <span key={m.userId} className="chip">
                            {m.displayName}
                            {m.role === "admin" && (
                              <span className="role">★ admin</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-head">
        <h2>People ({data.users.length})</h2>
      </div>
      <div className="glass card admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Type</th>
              <th>Phone</th>
              <th>SMS</th>
              <th>Gatherings</th>
              <th>Bookmarks</th>
              <th>Push</th>
              <th>Joined</th>
              <th>Last seen</th>
              <th>Trusted</th>
              {data.viewerIsOwner && <th />}
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => {
              const isMe = u.userId === data.viewerId;
              return (
                <tr key={u.userId} className={u.deactivated ? "admin-off" : ""}>
                  <td>
                    {u.displayName}
                    {u.deactivated && (
                      <span className="admin-off-tag">switched off</span>
                    )}
                    <div className="admin-sub">{u.userId}</div>
                  </td>
                  <td>{u.email ?? "—"}</td>
                  <td>{u.guest ? "guest" : "account"}</td>
                  <td>{u.phone ?? "—"}</td>
                  <td>{u.smsReminders ? "on" : "—"}</td>
                  <td>{u.gatherings}</td>
                  <td>{u.bookmarks}</td>
                  <td>{u.pushDevices}</td>
                  <td>{date(u.createdAt)}</td>
                  <td>{date(u.lastSignInAt)}</td>
                  <td>
                    {/* the owner can switch it; everyone else only reads it,
                        and nobody switches their own */}
                    {data.viewerIsOwner && !isMe ? (
                      <button
                        type="button"
                        className={`trust-toggle${u.trusted ? " on" : ""}`}
                        role="switch"
                        aria-checked={u.trusted}
                        aria-label={`Admin access for ${u.displayName}`}
                        disabled={busyUser === u.userId}
                        onClick={() => toggleTrust(u)}
                      >
                        <span className="trust-knob" />
                      </button>
                    ) : (
                      <span className="admin-sub">
                        {u.trusted ? (isMe ? "you" : "yes") : "—"}
                      </span>
                    )}
                  </td>
                  {data.viewerIsOwner && (
                    <td className="admin-row-actions">
                      {/* Standing in a switched-off account would be standing
                          in an account that cannot do anything — the ticket
                          resolves to an identity lib/auth refuses. */}
                      {!isMe && !u.trusted && !u.deactivated && (
                        <button
                          type="button"
                          className="rsvp-btn"
                          disabled={
                            busyUser === u.userId || !data.takeoverAvailable
                          }
                          title={
                            data.takeoverAvailable
                              ? `Sign in as ${u.displayName}`
                              : "Set ADMIN_SESSION_SECRET to enable this"
                          }
                          onClick={() => takeOver(u)}
                        >
                          <Icon name="person" /> Sign in as
                        </button>
                      )}
                      {/* Never your own row, and never another owner's: the
                          server refuses both, and a button that always fails
                          is worse than no button. */}
                      {!isMe && (
                        <button
                          type="button"
                          className={`rsvp-btn${u.deactivated ? "" : " danger"}`}
                          disabled={busyUser === u.userId}
                          title={
                            u.deactivated
                              ? `Switch ${u.displayName} back on`
                              : `Switch ${u.displayName} off`
                          }
                          onClick={() => toggleActive(u)}
                        >
                          <Icon name={u.deactivated ? "check" : "lock"} />{" "}
                          {u.deactivated ? "Switch on" : "Switch off"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.viewerIsOwner && data.takeovers.length > 0 && (
        <>
          <div className="section-head">
            <h2>Account take-overs</h2>
          </div>
          <div className="glass card admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Stood in by</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {data.takeovers.map((row) => (
                  <tr key={`${row.at}-${row.as}`}>
                    <td>{row.asName}</td>
                    <td>{row.byName}</td>
                    <td>{new Date(row.at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Switching an account off is the largest thing anyone can do to a
          person here, so it is written down for the same reason standing in
          one is: a power with no record of its use is one nobody can be held
          to. Switching back on is logged too — the record is of decisions,
          not only of punishments. */}
      {data.viewerIsOwner && data.deactivations.length > 0 && (
        <>
          <div className="section-head">
            <h2>Accounts switched off</h2>
          </div>
          <div className="glass card admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>What</th>
                  <th>By</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {data.deactivations.map((row) => (
                  <tr key={`${row.at}-${row.user}`}>
                    <td>{row.userName}</td>
                    <td>{row.off ? "switched off" : "switched back on"}</td>
                    <td>{row.byName}</td>
                    <td>{new Date(row.at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
