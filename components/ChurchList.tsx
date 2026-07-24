"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, getSavedName, saveName } from "@/lib/client";
import { useI18n } from "@/lib/i18n";
import type { Church } from "@/lib/types";

export default function ChurchList() {
  const { t } = useI18n();
  const [churches, setChurches] = useState<Church[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDisplayName(getSavedName());
    api<{ churches: Church[] }>("/api/churches")
      .then((res) => setChurches(res.churches))
      .catch(() => setChurches([]));
  }, []);

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
      setChurches((prev) => [res.church, ...(prev ?? [])]);
      setShowCreate(false);
      setName("");
      setDescription("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="section-head">
        <h1 className="page-title" style={{ margin: 0 }}>
          {t("churches.title")}
        </h1>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => setShowCreate(true)}
        >
          ⛪ {t("churches.create")}
        </button>
      </div>
      <p className="subtitle">{t("churches.subtitle")}</p>

      {churches === null ? (
        <p className="skeleton">{t("common.loading")}</p>
      ) : churches.length === 0 ? (
        <div className="glass card empty">
          <blockquote className="founding-verse">
            {t("verse.matthew")}
            <cite>{t("verse.matthewRef")}</cite>
          </blockquote>
          <p>{t("churches.empty")}</p>
        </div>
      ) : (
        <div>
          {churches.map((c) => (
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
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
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
              <button className="btn" onClick={() => setShowCreate(false)}>
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

      {!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && (
        <p className="notice">{t("common.demoNotice")}</p>
      )}
    </div>
  );
}
