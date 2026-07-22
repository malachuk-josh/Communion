"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { api, getSavedName, saveName } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import type { InviteInfo } from "@/lib/types";

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function JoinChurch({ token }: { token: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDisplayName(getSavedName());
    api<{ invite: InviteInfo }>(`/api/invites/${token}`)
      .then((res) => setInvite(res.invite))
      .catch(() => setInvalid(true));
  }, [token]);

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      saveName(displayName);
      const res = await api<{ churchId: string }>(`/api/invites/${token}`, {
        method: "POST",
        body: { displayName },
      });
      router.push(`/churches/${res.churchId}`);
    } catch (e) {
      // the invite itself is fine (the preview loaded) — show what went
      // wrong instead of pretending the link is dead
      setError((e as Error).message);
      setBusy(false);
    }
  };

  if (invalid) {
    return <div className="glass card empty">{t("join.invalid")}</div>;
  }
  if (!invite) {
    return <p className="skeleton">{t("common.loading")}</p>;
  }

  const acceptButton = (
    <button
      className="btn btn-primary"
      style={{ width: "100%" }}
      onClick={accept}
      disabled={busy}
    >
      {t("join.accept")}
    </button>
  );

  return (
    <div
      className="glass card"
      style={{ maxWidth: 480, margin: "48px auto", textAlign: "center" }}
    >
      <p style={{ color: "var(--ink-dim)" }}>{t("join.invited")}</p>
      <h1 className="page-title">{invite.churchName}</h1>
      <blockquote className="founding-verse" style={{ textAlign: "left" }}>
        {t("verse.matthew")}
        <cite>{t("verse.matthewRef")}</cite>
      </blockquote>
      <p
        style={{
          color: "var(--ink-faint)",
          fontSize: "0.85rem",
          marginBottom: 18,
        }}
      >
        {t("join.by")} {invite.invitedByName}
      </p>

      {clerkEnabled ? (
        <>
          <SignedIn>{acceptButton}</SignedIn>
          <SignedOut>
            <p
              style={{
                color: "var(--ink-dim)",
                fontSize: "0.9rem",
                marginBottom: 14,
              }}
            >
              {t("join.signInFirst")}
            </p>
            <SignInButton mode="modal" forceRedirectUrl={`/join/${token}`}>
              <button className="btn btn-primary" style={{ width: "100%" }}>
                {t("join.signInToAccept")}
              </button>
            </SignInButton>
          </SignedOut>
        </>
      ) : (
        <>
          <label className="field" style={{ textAlign: "left" }}>
            <span>{t("churches.yourName")}</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
            />
          </label>
          {acceptButton}
        </>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
