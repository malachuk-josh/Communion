"use client";

// Owner-only dashboard. The server is the real gate (the API 404s for
// anyone else); this view simply renders what it returns. Desktop-first —
// small screens get a note rather than a squeezed table.

import Link from "next/link";
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
  icon?: string;
  email?: string;
  createdAt?: number;
  lastSignInAt?: number;
  phone?: string;
  smsReminders: boolean;
  gatherings: number;
  bookmarks: number;
  pushDevices: number;
  guest: boolean;
}

interface Summary {
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

  useEffect(() => {
    api<Summary>("/api/admin")
      .then(setData)
      .catch(() => setDenied(true));
  }, []);

  if (denied) {
    return <p className="empty glass card">{t("join.invalid")}</p>;
  }
  if (!data) {
    return <p className="skeleton">{t("common.loading")}</p>;
  }

  return (
    <div className="admin">
      <BackToMenu />
      <h1 className="page-title">🛠 Admin</h1>
      <p className="subtitle">
        Everything happening across Communion. Visible only to you.
      </p>
      <p className="notice admin-mobile-note">
        The dashboard is built for a wider screen — open it on a desktop for
        the full tables.
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
                    {f.visibility === "private" ? "🔒 private" : "🌐 public"}
                  </td>
                  <td>{f.adminName}</td>
                  <td>{f.memberCount}</td>
                  <td>{f.threadCount}</td>
                  <td>{f.eventCount}</td>
                  <td>{date(f.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="rsvp-btn"
                      onClick={() =>
                        setExpanded(expanded === f.id ? null : f.id)
                      }
                    >
                      {expanded === f.id ? "▴" : "▾"}
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
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.userId}>
                <td>
                  {u.icon ? `${u.icon} ` : ""}
                  {u.displayName}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
