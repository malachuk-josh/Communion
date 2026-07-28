"use client";

import Link from "next/link";
import Icon from "@/components/Icon";
import { useEffect, useState } from "react";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import { api, saveName } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import BackToMenu from "@/components/BackToMenu";
import OfflineSettings from "@/components/OfflineSettings";
import ReminderSettings from "@/components/ReminderSettings";
import type { Church, Role } from "@/lib/types";

type MyChurch = Church & { myRole: Role; memberCount: number };

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/** Clerk's own account controls, or the sign-in door if you are signed out. */
function ClerkAccount() {
  const { t } = useI18n();
  const { user } = useUser();
  return (
    <>
      <SignedIn>
        <div className="pref-row">
          <span>
            {t("profile.signedInAs")}{" "}
            <strong>
              {user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? ""}
            </strong>
            <br />
            <small className="cal-hint">{t("profile.accountHint")}</small>
          </span>
          <UserButton />
        </div>
      </SignedIn>
      <SignedOut>
        <div className="pref-row">
          <span>
            <small className="cal-hint">{t("profile.signedOutHint")}</small>
          </span>
          <SignInButton mode="modal">
            <button className="btn btn-sm btn-primary">{t("auth.signIn")}</button>
          </SignInButton>
        </div>
      </SignedOut>
    </>
  );
}

export default function Settings() {
  const { lang, setLang, t } = useI18n();
  const [theme, setTheme] = useState<"dark" | "light" | "grey">("dark");
  const [churches, setChurches] = useState<MyChurch[] | null>(null);
  // your name, which used to live on its own Profile screen
  const [displayName, setDisplayName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [savingPrivate, setSavingPrivate] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [nameLoaded, setNameLoaded] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState("");
  const [offlineOpen, setOfflineOpen] = useState(false);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "light" || current === "grey" ? current : "dark");
    api<{ churches: MyChurch[] }>("/api/churches")
      .then((res) => setChurches(res.churches))
      .catch(() => setChurches([]));
    api<{ displayName: string; private: boolean }>("/api/profile")
      .then((res) => {
        setDisplayName(res.displayName);
        setIsPrivate(res.private);
      })
      .catch(() => {})
      .finally(() => setNameLoaded(true));
  }, []);

  // "Download for offline" elsewhere in the app opens straight onto that
  // screen. The hashchange listener is not spare: arriving here from another
  // route mounts this and the first line is enough, but following the same
  // link while already on settings changes only the hash, and Next keeps the
  // component mounted — without it, nothing at all would happen.
  useEffect(() => {
    const open = () => setOfflineOpen(window.location.hash === "#offline");
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);

  /**
   * Saved the moment it is switched rather than behind a Save button: this is
   * the one setting on the page where a person may be in a hurry, and leaving
   * it half-applied because they navigated away would be the wrong failure.
   */
  const savePrivate = async (next: boolean) => {
    setIsPrivate(next);
    setSavingPrivate(true);
    try {
      await api("/api/profile", { method: "POST", body: { private: next } });
    } catch {
      setIsPrivate(!next); // it did not take; say so by putting it back
    } finally {
      setSavingPrivate(false);
    }
  };

  const saveDisplayName = async () => {
    if (savingName || !displayName.trim()) return;
    setSavingName(true);
    setNameSaved(false);
    setNameError("");
    try {
      await api("/api/profile", {
        method: "POST",
        body: { displayName: displayName.trim() },
      });
      saveName(displayName); // prefill guest-mode prompts too
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2500);
    } catch (e) {
      setNameError((e as Error).message);
    } finally {
      setSavingName(false);
    }
  };

  const applyTheme = (next: "dark" | "light" | "grey") => {
    setTheme(next);
    if (next === "dark") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    window.localStorage.setItem("communion.theme", next);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        next === "light" ? "#ede1c8" : next === "grey" ? "#000000" : "#0b0d1a"
      );
  };

  /**
   * Delete a Gathering the reader founded.
   *
   * Behind a confirmation that has to be read rather than dismissed: this is
   * the one thing on this page that takes something away from other people —
   * every member loses it, along with its discussions and its sessions — and
   * there is nothing to undo it with.
   */
  const removeChurch = async (church: MyChurch) => {
    if (!window.confirm(t("settings.deleteGatheringConfirm", { name: church.name }))) {
      return;
    }
    setDeleting(church.id);
    try {
      await api(`/api/churches/${church.id}`, { method: "DELETE" });
      setChurches((prev) => prev?.filter((c) => c.id !== church.id) ?? null);
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setDeleting(null);
    }
  };

  const toggleVisibility = async (church: MyChurch) => {
    const next = church.visibility === "private" ? "public" : "private";
    setChurches(
      (prev) =>
        prev?.map((c) =>
          c.id === church.id ? { ...c, visibility: next } : c
        ) ?? null
    );
    try {
      await api(`/api/churches/${church.id}`, {
        method: "PATCH",
        body: { visibility: next },
      });
    } catch {
      // revert on failure
      setChurches(
        (prev) =>
          prev?.map((c) =>
            c.id === church.id ? { ...c, visibility: church.visibility } : c
          ) ?? null
      );
    }
  };

  // Offline takes the whole screen while it is open rather than unfolding
  // inside it: it is a page's worth of tiers and sizes, and reading it through
  // a hole halfway down a longer page is reading it badly.
  if (offlineOpen) {
    return (
      <OfflineSettings
        onBack={() => setOfflineOpen(false)}
        backLabel={t("settings.title")}
      />
    );
  }

  return (
    <div>
      <BackToMenu />
      {/* The way to the download screen sits with the title, not buried under
          the sections — it is a place to go, not a preference to set. */}
      <div className="settings-head">
        <div>
          <h1 className="page-title">{t("settings.title")}</h1>
          <p className="subtitle">{t("settings.subtitle")}</p>
        </div>
        <button
          type="button"
          className="btn btn-sm settings-offline-btn"
          onClick={() => setOfflineOpen(true)}
        >
          <Icon name="download" /> {t("menu.offline")}
        </button>
      </div>

      {/* First, and on its own: the one setting people come back to change,
          and the only one whose effect is visible the moment it is pressed. */}
      <div className="glass card">
        <div className="pref-row">
          <span>{t("settings.theme")}</span>
          <div className="lang-toggle" role="group">
            <button
              className={theme === "dark" ? "active" : ""}
              onClick={() => applyTheme("dark")}
            >
              <Icon name="moon" /> {t("settings.themeDark")}
            </button>
            <button
              className={theme === "grey" ? "active" : ""}
              onClick={() => applyTheme("grey")}
            >
              <Icon name="news" /> {t("settings.themeGrey")}
            </button>
            <button
              className={theme === "light" ? "active" : ""}
              onClick={() => applyTheme("light")}
            >
              <Icon name="sun" /> {t("settings.themeLight")}
            </button>
          </div>
        </div>
      </div>

      <div className="section-head">
        <h2>{t("settings.you")}</h2>
      </div>
      <div className="glass card">
        <label className="field">
          <span>{t("profile.displayName")}</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={nameLoaded ? t("churches.yourName") : "…"}
            maxLength={60}
          />
        </label>
        <p className="cal-hint">{t("profile.displayNameHint")}</p>
        {nameError && <p className="error-text">{nameError}</p>}
        <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
          <button
            className="btn btn-primary"
            onClick={saveDisplayName}
            disabled={savingName || !displayName.trim()}
          >
            {nameSaved ? `✓ ${t("settings.saved")}` : t("common.save")}
          </button>
        </div>
      </div>

      <div className="section-head">
        <h2>{t("settings.privacy")}</h2>
      </div>
      <div className="glass card">
        <label className="toggle-row" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => savePrivate(e.target.checked)}
            disabled={!nameLoaded || savingPrivate}
          />
          {t("settings.privateProfile")}
        </label>
        <p className="cal-hint">{t("settings.privateProfileHint")}</p>
      </div>

      <div className="section-head">
        <h2>{t("profile.account")}</h2>
      </div>
      <div className="glass card">
        {clerkEnabled ? (
          <ClerkAccount />
        ) : (
          <p className="cal-hint">{t("profile.guestHint")}</p>
        )}
      </div>

      <div className="section-head">
        <h2>{t("settings.preferences")}</h2>
      </div>
      <div className="glass card">
        <div className="pref-row">
          <span>{t("settings.language")}</span>
          <div className="lang-toggle" role="group">
            <button
              className={lang === "en" ? "active" : ""}
              onClick={() => setLang("en")}
            >
              English
            </button>
            <button
              className={lang === "es" ? "active" : ""}
              onClick={() => setLang("es")}
            >
              Español
            </button>
          </div>
        </div>
      </div>

      <ReminderSettings />

      <div className="section-head">
        <h2>{t("settings.myChurches")}</h2>
      </div>
      {churches === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : churches.length === 0 ? (
        <div className="glass card empty">{t("churches.empty")}</div>
      ) : (
        churches.map((church) => (
          <div key={church.id} className="glass card settings-church">
            <div className="settings-church-head">
              <div>
                <h3>{church.name}</h3>
                <p className="session-meta">
                  {church.myRole === "founder"
                    ? `★ ${t("churches.founder")}`
                    : t("discover.mine")}
                  {" · "}
                  {t(
                    church.memberCount === 1
                      ? "discover.memberOne"
                      : "discover.members",
                    { count: String(church.memberCount) }
                  )}
                  {" · "}
                  {church.visibility === "private"
                    ? t("churches.privateBadge")
                    : t("settings.public")}
                </p>
              </div>
              <Link href={`/churches/${church.id}`} className="btn btn-sm">
                {t("settings.open")} →
              </Link>
            </div>
            {church.myRole === "founder" && (
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={church.visibility === "private"}
                  onChange={() => toggleVisibility(church)}
                />
                <Icon name="lock" /> {t("churches.privateLabel")}
              </label>
            )}
            {church.myRole === "founder" && (
              <div className="settings-church-danger">
                <button
                  type="button"
                  className="btn btn-sm jr-danger"
                  onClick={() => removeChurch(church)}
                  disabled={deleting === church.id}
                >
                  <Icon name="trash" />{" "}
                  {deleting === church.id
                    ? t("common.loading")
                    : t("settings.deleteGathering")}
                </button>
                <p className="cal-hint">{t("settings.deleteGatheringHint")}</p>
              </div>
            )}
          </div>
        ))
      )}
      <p className="notice">{t("settings.membersHint")}</p>
    </div>
  );
}
