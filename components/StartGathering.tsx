"use client";

// The "Start a Gathering" button and its create form. Shared by the
// Gatherings tab and the Discover directory so both open the same flow.

import { useState } from "react";
import Icon from "@/components/Icon";
import { api, getSavedName, saveName } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import type { Church } from "@/lib/types";

export default function StartGathering({
  className = "btn btn-sm btn-primary",
  onCreated,
}: {
  className?: string;
  onCreated?: (church: Church) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      saveName(displayName);
      const res = await api<{ church: Church }>("/api/churches", {
        method: "POST",
        body: { name, description, displayName },
      });
      onCreated?.(res.church);
      setOpen(false);
      setName("");
      setDescription("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setDisplayName(getSavedName());
          setOpen(true);
        }}
      >
        <Icon name="church" /> {t("churches.create")}
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="glass modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t("churches.create")}</h2>
            <blockquote className="founding-verse">
              {t("verse.matthew")}
              <cite>{t("verse.matthewRef")}</cite>
            </blockquote>
            <label className="field">
              <span>{t("churches.name")}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("churches.namePlaceholder")}
                maxLength={80}
                autoFocus
              />
            </label>
            <label className="field">
              <span>{t("churches.description")}</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("churches.descriptionPlaceholder")}
                maxLength={300}
              />
            </label>
            <label className="field">
              <span>{t("churches.yourName")}</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={60}
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button className="btn" onClick={() => setOpen(false)}>
                {t("session.cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={create}
                disabled={!name.trim() || busy}
              >
                {t("churches.create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
