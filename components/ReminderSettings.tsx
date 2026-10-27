"use client";

// Reminders: web push on or off for this device. Push is a per-device browser
// subscription, so it is switched here, on the device, rather than kept on the
// account; when and for which plan a reminder comes is set on the plan itself.
//
// Text-message reminders sat beside it, with a phone number to send them to.
// They announced Gathering sessions, and went with the Gatherings.

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

export default function ReminderSettings() {
  const { t } = useI18n();
  const [push, setPush] = useState<PushState>("loading");

  useEffect(() => {
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
      </div>
    </>
  );
}
