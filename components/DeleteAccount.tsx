"use client";

// The way out.
//
// Every app that lets somebody in has to let them leave, and both app stores
// now refuse to list one that does not. But the reason it reads the way it
// does is simpler than either: a person asking to be deleted is asking for
// something specific and slightly frightening, and the least this screen can
// do is say exactly what is about to happen and then do exactly that.
//
// So it is closed by default, it names what goes and what stays, and it asks
// for the word to be typed. Not friction for its own sake — this is the one
// action in the app that cannot be undone, and a misplaced thumb should not
// be able to reach it. Everything else here is recoverable; this is not.

import { useState } from "react";
import Icon from "@/components/Icon";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n";

export default function DeleteAccount() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/api/account", {
        method: "DELETE",
        body: { confirm: "DELETE" },
      });
      /*
       * The device is holding a copy of them too.
       *
       * Bookmarks, notes and an outbox of unsent changes all live in
       * IndexedDB, and an account deleted on the server with its journal
       * still on the phone would sync itself straight back into a new one the
       * next time anybody signed in here. Cleared before the reload, and the
       * reload is what makes the app forget who it was talking to.
       */
      await import("@/lib/localStore")
        .then((m) => m.clearLocalData())
        .catch(() => {});
      await import("@/lib/offline")
        .then((m) => m.clearApiCache())
        .catch(() => {});
      try {
        localStorage.clear();
      } catch {
        // storage blocked: there was nothing kept here to clear
      }
      window.location.href = "/";
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="section-head">
        <h2>{t("account.deleteTitle")}</h2>
      </div>
      <div className="glass card">
        {!open ? (
          <>
            <p className="cal-hint">{t("account.deleteLede")}</p>
            <button
              type="button"
              className="btn btn-sm danger"
              onClick={() => setOpen(true)}
            >
              <Icon name="trash" /> {t("account.deleteOpen")}
            </button>
          </>
        ) : (
          <>
            <p className="account-goes">{t("account.deleteWhatGoes")}</p>
            <p className="cal-hint">{t("account.deleteWhatStays")}</p>
            <label className="account-confirm">
              {t("account.deleteType")}
              <input
                type="text"
                value={typed}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setTyped(e.target.value)}
                aria-label={t("account.deleteType")}
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="account-actions">
              <button
                type="button"
                className="btn btn-sm danger"
                disabled={typed.trim() !== "DELETE" || busy}
                onClick={remove}
              >
                {busy ? t("account.deleting") : t("account.deleteConfirm")}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setTyped("");
                  setError("");
                }}
              >
                {t("common.close")}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
