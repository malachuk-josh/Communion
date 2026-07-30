"use client";

import Link from "next/link";
import Icon from "@/components/Icon";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import { useStickyTab } from "@/lib/stickyTab";
import StartGathering from "@/components/StartGathering";
import UpcomingSessions from "@/components/UpcomingSessions";
import type { Church, DiscoverChurch } from "@/lib/types";

/** The toggles, in the order the row shows them. */
const GATHERING_TABS = ["mine", "public", "sessions"] as const;

export default function ChurchList() {
  const { t } = useI18n();
  const [tab, setTab] = useStickyTab("gatherings", "mine", GATHERING_TABS);
  const [churches, setChurches] = useState<Church[] | null>(null);
  const [open, setOpen] = useState<DiscoverChurch[] | null>(null);

  useEffect(() => {
    api<{ churches: Church[] }>("/api/churches")
      .then((res) => setChurches(res.churches))
      .catch(() => setChurches([]));
  }, []);

  // The open directory is fetched the first time it is asked for rather than
  // on arrival. Most visits to this page are to walk back into a Gathering
  // already joined, and that should not wait on a list of everybody else's.
  useEffect(() => {
    if (tab !== "public" || open !== null) return;
    api<{ churches: DiscoverChurch[] }>("/api/discover")
      .then((res) => setOpen(res.churches))
      .catch(() => setOpen([]));
  }, [tab, open]);

  const showing = tab === "mine" ? churches : open;

  return (
    <div>
      <div className="section-head">
        <h1 className="page-title" style={{ margin: 0 }}>
          {t(
            tab === "mine"
              ? "churches.title"
              : tab === "public"
                ? "churches.titlePublic"
                : "churches.titleSessions"
          )}
        </h1>
        <StartGathering
          // a new Gathering starts public, so it belongs on both shelves
          onCreated={(church) => {
            setChurches((prev) => [church, ...(prev ?? [])]);
            setOpen((prev) =>
              prev === null
                ? prev
                : [{ ...church, memberCount: 1, mine: true }, ...prev],
            );
          }}
        />
      </div>
      {/* The ones you are in, the ones anyone may ask to join, and when the
          first of those next meet. Two of the three ask who; the third asks
          when, which is the question this page could not answer before. */}
      <div className="lang-toggle discover-tabs" role="group">
        <button
          className={tab === "mine" ? "active" : ""}
          onClick={() => setTab("mine")}
          aria-pressed={tab === "mine"}
        >
          <Icon name="people" /> {t("churches.tabMine")}
        </button>
        <button
          className={tab === "public" ? "active" : ""}
          onClick={() => setTab("public")}
          aria-pressed={tab === "public"}
        >
          <Icon name="globe" /> {t("churches.tabPublic")}
        </button>
        <button
          className={tab === "sessions" ? "active" : ""}
          onClick={() => setTab("sessions")}
          aria-pressed={tab === "sessions"}
        >
          <Icon name="calendar" /> {t("churches.tabSessions")}
        </button>
      </div>
      <p className="subtitle">
        {t(
          tab === "mine"
            ? "churches.subtitle"
            : tab === "public"
              ? "churches.subtitlePublic"
              : "churches.subtitleSessions"
        )}
      </p>

      {tab === "sessions" ? (
        <UpcomingSessions />
      ) : showing === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : showing.length === 0 ? (
        <div className="glass card empty">
          <blockquote className="founding-verse">
            {t("verse.matthew")}
            <cite>{t("verse.matthewRef")}</cite>
          </blockquote>
          <p>{t(tab === "mine" ? "churches.empty" : "churches.publicEmpty")}</p>
        </div>
      ) : tab === "mine" ? (
        <div>
          {(showing as Church[]).map((c) => (
            <Link
              key={c.id}
              href={`/churches/${c.id}`}
              className="glass church-row card"
            >
              <h3>{c.name}</h3>
              {c.description && <p>{c.description}</p>}
            </Link>
          ))}
        </div>
      ) : (
        // an open Gathering is worth knowing the size of before knocking, and
        // worth marking when it is one you are already in
        (showing as DiscoverChurch[]).map((c) => (
          <Link
            key={c.id}
            href={`/churches/${c.id}`}
            className="glass church-row card"
          >
            <div className="discover-head">
              <h3>{c.name}</h3>
              <span className="discover-badges">
                {c.mine && (
                  <span className="chip mine-chip">✓ {t("discover.mine")}</span>
                )}
                <span className="chip">
                  <Icon name="people" />{" "}
                  {t(
                    c.memberCount === 1
                      ? "discover.memberOne"
                      : "discover.members",
                    { count: String(c.memberCount) },
                  )}
                </span>
              </span>
            </div>
            {c.description && <p>{c.description}</p>}
          </Link>
        ))
      )}

      {!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && (
        <p className="notice">{t("common.demoNotice")}</p>
      )}
    </div>
  );
}
