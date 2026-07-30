"use client";

// Reminders & notifications: web-push enable/disable for this device, and
// the phone number + SMS opt-in stored on the user profile. Push is a
// per-device browser subscription; SMS is a per-user preference that goes
// live once the Brevo account has SMS credits and a registered sender.

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";

type PushState =
  | "loading"
  | "unsupported"
  | "unavailable"
  | "off"
  | "on"
  | "blocked"
  | "busy";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Stored E.164 → what the input shows: US numbers without their +1 prefix. */
function toDisplay(e164: string): string {
  return /^\+1\d{10}$/.test(e164) ? e164.slice(2) : e164;
}

/** Input value → E.164 to store: bare 10 digits get the +1 prefix. */
function toE164(input: string): string {
  const cleaned = input.replace(/[\s().-]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  const digits = cleaned.replace(/\D/g, "");
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;
  return `+1${digits}`;
}

export default function ReminderSettings() {
  const { t } = useI18n();
  const [push, setPush] = useState<PushState>("loading");
  const [phone, setPhone] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [smsAvailable, setSmsAvailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{
      phone: string;
      smsReminders: boolean;
      smsAvailable: boolean;
    }>("/api/profile")
      .then((res) => {
        setPhone(toDisplay(res.phone));
        setSmsOptIn(res.smsReminders);
        setSmsAvailable(res.smsAvailable);
      })
      .catch(() => {});

    if (!VAPID_PUBLIC) {
      setPush("unavailable");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPush("unsupported");
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub) setPush("on");
        else if (Notification.permission === "denied") setPush("blocked");
        else setPush("off");
      })
      .catch(() => setPush("unsupported"));
  }, []);

  const enablePush = async () => {
    if (!VAPID_PUBLIC) return;
    setPush("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPush(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC).buffer as ArrayBuffer,
      });
      await api("/api/push", { method: "POST", body: { subscription: sub.toJSON() } });
      setPush("on");
    } catch {
      setPush("off");
    }
  };

  const disablePush = async () => {
    setPush("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api("/api/push", {
          method: "DELETE",
          body: { endpoint: sub.endpoint },
        });
        await sub.unsubscribe();
      }
    } catch {
      // best effort — server prunes dead subscriptions on send anyway
    }
    setPush("off");
  };

  const saveSms = async () => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await api("/api/profile", {
        method: "POST",
        body: {
          phone: toE164(phone),
          smsReminders: smsOptIn && !!phone.trim(),
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="section-head">
        <h2>{t("settings.notifications")}</h2>
      </div>
      <div className="glass card">
        <div className="pref-row">
          <span>
            <Icon name="bell" /> {t("settings.pushLabel")}
            <br />
            <small className="cal-hint">{t("settings.pushHint")}</small>
          </span>
          {push === "on" ? (
            <button className="btn btn-sm" onClick={disablePush}>
              ✓ {t("settings.pushOn")}
            </button>
          ) : push === "off" ? (
            <button className="btn btn-sm btn-primary" onClick={enablePush}>
              {t("settings.pushEnable")}
            </button>
          ) : (
            <span className="cal-hint">
              {push === "blocked"
                ? t("settings.pushBlocked")
                : push === "unsupported"
                  ? t("settings.pushUnsupported")
                  : push === "unavailable"
                    ? t("settings.pushUnavailable")
                    : t("common.loading")}
            </span>
          )}
        </div>

        {/* The reading reminder used to be here, as one hour for every plan
            at once. One hour is wrong the moment somebody walks two plans,
            which is the ordinary case — so it moved onto each plan, in the
            Journal, where the plan already lives. */}
        <p className="cal-hint">{t("settings.planMoved")}</p>

        <div className="pref-row" style={{ alignItems: "flex-start" }}>
          <span><Icon name="chat" /> {t("settings.smsTitle")}</span>
          <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
            <span className="phone-row">
              {!phone.trim().startsWith("+") && (
                <span className="phone-prefix">+1</span>
              )}
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                maxLength={20}
                style={{ maxWidth: 160 }}
              />
            </span>
            <small className="cal-hint">{t("settings.phoneIntlHint")}</small>
            <label className="toggle-row" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={smsOptIn}
                onChange={(e) => setSmsOptIn(e.target.checked)}
                disabled={!phone.trim()}
              />
              {t("settings.smsLabel")}
            </label>
            <button
              className="btn btn-sm"
              onClick={saveSms}
              disabled={saving}
            >
              {saved ? `✓ ${t("settings.saved")}` : t("common.save")}
            </button>
          </div>
        </div>
        {smsOptIn && (
          <p className="notice" style={{ marginTop: 6 }}>
            {t("settings.smsConsent")}
            {!smsAvailable && <> {t("settings.smsPending")}</>}
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>
    </>
  );
}
