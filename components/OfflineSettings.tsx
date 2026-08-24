"use client";

// Settings → Offline. Download Communion onto the phone, a tier at a time, and
// see what it costs. The service worker stores the files; this screen only
// asks and reports.
//
// It is reached from the settings screen and takes it over while it is open —
// its own page, in the place of one, rather than a section unfolding halfway
// down. So it is handed the way back rather than assuming one: given `onBack`
// it returns to settings, and without it to the menu.

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import BackToMenu from "@/components/BackToMenu";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { TRANSLATIONS } from "@/lib/bible";
import { onPendingChange, flush, startSync } from "@/lib/sync";
import {
  clearDownloads,
  downloadTier,
  formatBytes,
  loadManifest,
  requestPersistence,
  storageUsed,
  supportsOffline,
  tierProgress,
  type OfflineManifest,
  type Tier,
} from "@/lib/offline";

interface Row {
  id: string;
  title: string;
  detail: string;
  tier: Tier;
  have: number;
}

export default function OfflineSettings({
  onBack,
  backLabel,
}: {
  /** where the way back goes, when it is not the menu */
  onBack?: () => void;
  backLabel?: string;
}) {
  const { t, lang } = useI18n();
  const [manifest, setManifest] = useState<OfflineManifest | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [used, setUsed] = useState<{ used: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const [error, setError] = useState("");

  const describe = useCallback(
    (data: OfflineManifest): Promise<Row[]> => {
      const label = (id: string): { title: string; detail: string } => {
        if (id === "reading") {
          return {
            title: t("offline.reading"),
            detail: t("offline.readingDesc"),
          };
        }
        if (id === "commentary") {
          return {
            title: t("offline.commentary"),
            detail: t("offline.commentaryDesc"),
          };
        }
        if (id === "study") {
          return { title: t("offline.study"), detail: t("offline.studyDesc") };
        }
        const code = id.replace("translation:", "");
        const tr = TRANSLATIONS.find((x) => x.id === code);
        return {
          title: tr ? `${tr.abbrev} — ${tr.name}` : code.toUpperCase(),
          detail: t("offline.translationDesc"),
        };
      };
      // reading first, then the extra translations, then the study tools
      const order = (id: string) =>
        id === "reading" ? 0 : id === "study" ? 2 : id === "commentary" ? 3 : 1;
      return Promise.all(
        Object.entries(data.tiers)
          .sort((a, b) => order(a[0]) - order(b[0]))
          .map(async ([id, tier]) => ({
            id,
            ...label(id),
            tier,
            have: await tierProgress(tier),
          }))
      );
    },
    [t]
  );

  const refresh = useCallback(async () => {
    try {
      const data = await loadManifest();
      setManifest(data);
      setRows(await describe(data));
      setUsed(await storageUsed());
    } catch {
      setError(t("offline.unavailable"));
    }
  }, [describe, t]);

  useEffect(() => {
    if (!supportsOffline()) {
      setError(t("offline.unavailable"));
      setRows([]);
      return;
    }
    void refresh();
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
  }, [refresh, t]);

  // changes made offline, still waiting for a connection. startSync counts
  // the outbox — the reader normally does this, but it isn't mounted here.
  useEffect(() => {
    startSync();
    return onPendingChange(setWaiting);
  }, []);

  // re-label when the language flips without re-reading the manifest
  useEffect(() => {
    if (manifest) void describe(manifest).then(setRows);
  }, [lang, manifest, describe]);

  const download = async (row: Row) => {
    if (busy) return;
    setBusy(row.id);
    setPct(0);
    setError("");
    // downloading is the moment to ask not to be evicted
    setPersisted(await requestPersistence());
    try {
      await downloadTier(row.tier, (p) =>
        setPct(Math.round(((p.done + p.failed) / Math.max(1, p.total)) * 100))
      );
      await refresh();
    } catch {
      setError(t("offline.failed"));
    } finally {
      setBusy(null);
      setPct(0);
    }
  };

  const removeAll = async () => {
    if (busy || !window.confirm(t("offline.clearConfirm"))) return;
    setBusy("clear");
    try {
      await clearDownloads();
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const stored = rows?.reduce(
    (sum, r) => sum + (r.have / Math.max(1, r.tier.urls.length)) * r.tier.bytes,
    0
  );

  return (
    <div>
      {onBack ? (
        <button
          type="button"
          className="passage-link back-link"
          onClick={onBack}
        >
          ← {backLabel ?? t("menu.title")}
        </button>
      ) : (
        <BackToMenu />
      )}
      <h1 className="page-title">{t("offline.title")}</h1>
      <p className="subtitle">{t("offline.subtitle")}</p>

      {error && <p className="notice">{error}</p>}

      {waiting > 0 && (
        <div className="glass card offline-row">
          <div className="offline-head">
            <strong><Icon name="hourglass" /> {t("offline.waiting", { n: String(waiting) })}</strong>
          </div>
          <p className="cal-hint">{t("offline.waitingDesc")}</p>
          <div className="offline-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void flush()}
              disabled={!!busy}
            >
              {t("offline.syncNow")}
            </button>
          </div>
        </div>
      )}

      {rows === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : (
        rows.map((row) => {
          const complete = row.have >= row.tier.urls.length;
          const partial = row.have > 0 && !complete;
          const running = busy === row.id;
          return (
            <div key={row.id} className="glass card offline-row">
              <div className="offline-head">
                <strong>{row.title}</strong>
                <span className="offline-size">
                  {formatBytes(row.tier.bytes)}
                </span>
              </div>
              <p className="cal-hint">{row.detail}</p>
              {running ? (
                <div className="offline-bar" aria-live="polite">
                  <div className="offline-bar-fill" style={{ width: `${pct}%` }} />
                  <span>{pct}%</span>
                </div>
              ) : (
                <div className="offline-actions">
                  <button
                    type="button"
                    className={`btn btn-sm${complete ? "" : " btn-primary"}`}
                    onClick={() => download(row)}
                    disabled={!!busy || complete}
                  >
                    {complete
                      ? `✓ ${t("offline.saved")}`
                      : partial
                        ? t("offline.finish", {
                            n: String(row.tier.urls.length - row.have),
                          })
                        : t("offline.download")}
                  </button>
                  {partial && (
                    <span className="cal-hint">
                      {t("offline.partial", {
                        have: String(row.have),
                        total: String(row.tier.urls.length),
                      })}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}

      {rows && rows.length > 0 && (
        <div className="glass card offline-foot">
          <p className="pref-row">
            <span>{t("offline.stored")}</span>
            <strong>{formatBytes(stored ?? 0)}</strong>
          </p>
          {used && used.quota > 0 && (
            <p className="cal-hint">
              {t("offline.quota", {
                used: formatBytes(used.used),
                quota: formatBytes(used.quota),
              })}
            </p>
          )}
          <p className="cal-hint">
            {persisted ? t("offline.persisted") : t("offline.notPersisted")}
          </p>
          <div className="offline-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={removeAll}
              disabled={!!busy}
            >
              <Icon name="trash" /> {t("offline.clear")}
            </button>
          </div>
        </div>
      )}

      {/* The borrowed translations are absent from the list above because
          there is nothing to download — say why, rather than let someone hunt
          for a tier that was never going to be there. */}
      {TRANSLATIONS.some((x) => x.licensed) && (
        <p className="notice offline-note">
          {t("offline.licensed", {
            names: TRANSLATIONS.filter((x) => x.licensed)
              .map((x) => x.abbrev)
              .join(", "),
          })}
        </p>
      )}

      <p className="notice offline-note">
        {t("offline.note" as MessageKey)}
      </p>
    </div>
  );
}
