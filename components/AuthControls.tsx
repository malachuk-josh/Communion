"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { useI18n } from "@/lib/i18n";

// Renders nothing until Clerk keys are configured; then shows the real
// sign-in button / user avatar in the nav.
export default function AuthControls() {
  const { t } = useI18n();
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;
  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <button className="btn btn-sm">{t("auth.signIn")}</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </>
  );
}
