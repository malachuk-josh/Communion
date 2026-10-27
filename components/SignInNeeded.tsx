"use client";

// What a reader with no account meets in place of something that needs one.
//
// Not a refusal. An account is a minute away, and what these explain is the
// reason — because the reason is the thing people did not know: a bookmark
// made without one is kept on this device only, waiting for an owner, and goes
// whenever the browser forgets it.
//
// Rendered only where sign-in exists (see lib/account), which is also the only
// place Clerk's button can be.

import { SignInButton } from "@clerk/nextjs";
import Icon from "@/components/Icon";
import { useI18n } from "@/lib/i18n";

/** Set while the reader is away signing in, so study mode opens on their return. */
export const STUDY_AFTER_SIGN_IN = "communion.studyAfterSignIn";

/** Asked instead of opening study mode. */
export function StudySignIn({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  // Clerk's button runs this before opening its own sheet, so this one is out
  // of the way first, and the wish to study outlives a redirect sign-in too.
  const remember = () => {
    try {
      sessionStorage.setItem(STUDY_AFTER_SIGN_IN, "1");
    } catch {
      // storage blocked: they will tap the star again themselves
    }
    onClose();
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass modal study-gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-gate-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mh-head">
          <h2 id="study-gate-title">{t("study.gateTitle")}</h2>
          <button
            type="button"
            className="lex-close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>
        <p className="study-gate-body">{t("study.gateBody")}</p>
        <p className="cal-hint">{t("study.gateHint")}</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t("common.notNow")}
          </button>
          <SignInButton mode="modal">
            <button type="button" className="btn btn-primary" onClick={remember}>
              {t("auth.signIn")}
            </button>
          </SignInButton>
        </div>
      </div>
    </div>
  );
}

/** In place of the wall and the prayer list, which are kept on the account. */
export function WallSignIn() {
  const { t } = useI18n();
  return (
    <div className="glass card wall-signin">
      <p>
        <Icon name="lock" /> {t("wall.signIn")}
      </p>
      <SignInButton mode="modal">
        <button type="button" className="btn btn-primary">
          {t("auth.signIn")}
        </button>
      </SignInButton>
    </div>
  );
}
