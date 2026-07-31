"use client";

// Notifications on by default, as far as browsers allow: a device that has
// already granted permission is re-subscribed silently (no trip to
// Settings), and a device that hasn't been asked yet gets one gentle
// prompt. Browsers require a user gesture to grant permission, so the
// prompt is the closest thing to a default "on".

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { WELCOMED_EVENT, WELCOMED_KEY } from "@/components/Welcome";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const ASKED_KEY = "communion.pushAsked";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function subscribe(): Promise<boolean> {
  if (!VAPID_PUBLIC) return false;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
          .buffer as ArrayBuffer,
      }));
    await api("/api/push", {
      method: "POST",
      body: { subscription: sub.toJSON() },
    });
    return true;
  } catch {
    return false;
  }
}

export default function PushPrompt() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (
      !VAPID_PUBLIC ||
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      return;
    }
    if (Notification.permission === "granted") {
      // already allowed — keep this device registered without asking
      void subscribe();
      return;
    }
    if (Notification.permission === "denied") return;
    try {
      if (window.localStorage.getItem(ASKED_KEY) === "1") return;
    } catch {
      return;
    }
    // Let the app settle before asking — and on a first visit, let the
    // welcome screen finish first. Asking for a permission on top of the
    // front door is how you teach somebody to say no.
    let timer = 0;
    const start = () => {
      timer = window.setTimeout(() => setShow(true), 3000);
    };
    let welcomed = true;
    try {
      welcomed = window.localStorage.getItem(WELCOMED_KEY) === "1";
    } catch {
      // storage unreadable: the welcome will not show either, so just start
    }
    if (welcomed) start();
    else window.addEventListener(WELCOMED_EVENT, start, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(WELCOMED_EVENT, start);
    };
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(ASKED_KEY, "1");
    } catch {
      // private mode — it'll ask again next visit
    }
  };

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") await subscribe();
    } catch {
      // user dismissed the browser prompt
    } finally {
      setBusy(false);
      dismiss();
    }
  };

  if (!show) return null;

  return (
    <div className="glass push-prompt" role="dialog">
      <span className="push-prompt-body">
        <strong><Icon name="bell" /> {t("push.promptTitle")}</strong>
        <small>{t("push.promptBody")}</small>
      </span>
      <span className="push-prompt-actions">
        <button type="button" className="btn btn-sm" onClick={dismiss}>
          {t("push.later")}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={enable}
          disabled={busy}
        >
          {t("push.allow")}
        </button>
      </span>
    </div>
  );
}
