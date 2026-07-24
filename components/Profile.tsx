"use client";

// User profile: the display name shown on church member lists and RSVP
// lists, plus account status (Clerk account or guest mode).

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

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

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

export default function Profile() {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ displayName: string }>("/api/profile")
      .then((res) => {
        setDisplayName(res.displayName);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    if (saving || !displayName.trim()) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await api("/api/profile", {
        method: "POST",
        body: { displayName: displayName.trim() },
      });
      saveName(displayName); // prefill guest-mode prompts too
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <BackToMenu />
      <h1 className="page-title">{t("profile.title")}</h1>
      <p className="subtitle">{t("profile.subtitle")}</p>

      <div className="glass card">
        <label className="field">
          <span>{t("profile.displayName")}</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={loaded ? t("churches.yourName") : "…"}
            maxLength={60}
          />
        </label>
        <p className="cal-hint">{t("profile.displayNameHint")}</p>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={saving || !displayName.trim()}
          >
            {saved ? `✓ ${t("settings.saved")}` : t("common.save")}
          </button>
        </div>
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
    </div>
  );
}
